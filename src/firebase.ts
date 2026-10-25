import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  User,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  ProjectStatus,
  StudioCategory,
  StudioProjectRecord,
  sanitizeProjectDraft,
  validateProjectPayload,
  validateUserProfilePayload,
} from './utils/studioLogic';

const app = initializeApp(firebaseConfig);
export const db = getFirestoreInstance();
export const auth = getAuth(app);

import { getFirestore } from 'firebase/firestore';
function getFirestoreInstance() {
  return getFirestore(app, firebaseConfig.firestoreDatabaseId);
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate connection to Firestore on boot as required by firebase-integration-rpc
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export async function signInDirectorWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  await ensureDirectorProfile(cred.user);
  return cred.user;
}

export async function signOutDirector(): Promise<void> {
  await signOut(auth);
}

export async function ensureDirectorProfile(user: User): Promise<void> {
  const profilePath = `users/${user.uid}`;
  const profileRef = doc(db, 'users', user.uid);
  try {
    const existingSnap = await getDoc(profileRef);
    if (!existingSnap.exists()) {
      const displayName = (user.displayName || 'Studio Director').slice(0, 80);
      const check = validateUserProfilePayload({
        uid: user.uid,
        displayName,
        studioRole: 'Director',
      });
      if (!check.valid) {
        throw new Error(check.error);
      }
      await setDoc(profileRef, {
        uid: user.uid,
        displayName,
        studioRole: 'Director',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, profilePath);
  }
}

export async function createStudioProjectInFirestore(input: {
  ownerId: string;
  title: string;
  category: StudioCategory;
  genre: string;
  prompt: string;
  scriptText: string;
  status?: ProjectStatus;
}): Promise<string> {
  const sanitized = sanitizeProjectDraft(input);
  const check = validateProjectPayload(sanitized);
  if (!check.valid) {
    throw new Error(check.error || 'Invalid project payload');
  }
  const projectId = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const path = `projects/${projectId}`;
  try {
    await setDoc(doc(db, 'projects', projectId), {
      ...sanitized,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return projectId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateStudioProjectStatusInFirestore(
  projectId: string,
  status: ProjectStatus
): Promise<void> {
  const path = `projects/${projectId}`;
  try {
    await updateDoc(doc(db, 'projects', projectId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteStudioProjectFromFirestore(projectId: string): Promise<void> {
  const path = `projects/${projectId}`;
  try {
    await deleteDoc(doc(db, 'projects', projectId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeToDirectorProjects(
  uid: string,
  onData: (projects: StudioProjectRecord[]) => void,
  onErrorCallback?: (err: Error) => void
) {
  const q = query(collection(db, 'projects'), where('ownerId', '==', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: StudioProjectRecord[] = snapshot.docs.map((d) => {
        const data = d.data();
        const createdIso =
          data.createdAt && typeof data.createdAt.toDate === 'function'
            ? data.createdAt.toDate().toISOString()
            : new Date().toISOString();
        return {
          id: d.id,
          ownerId: String(data.ownerId || uid),
          title: String(data.title || 'Untitled Project'),
          category: (data.category as StudioCategory) || 'drama',
          genre: String(data.genre || 'Drama'),
          prompt: String(data.prompt || ''),
          scriptText: String(data.scriptText || ''),
          status: (data.status as ProjectStatus) || 'draft',
          createdAtIso: createdIso,
        };
      });
      list.sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
      onData(list);
    },
    (error) => {
      if (onErrorCallback) {
        onErrorCallback(error instanceof Error ? error : new Error(String(error)));
      }
      handleFirestoreError(error, OperationType.LIST, 'projects');
    }
  );
}

export { onAuthStateChanged };
export type { User };
