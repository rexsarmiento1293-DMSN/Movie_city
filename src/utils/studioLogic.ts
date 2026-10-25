export type StudioCategory = 'drama' | 'video' | 'image' | 'effects' | 'music';
export type ProjectStatus = 'draft' | 'published' | 'archived';
export type StudioRole = 'Director' | 'Screenwriter' | 'Cinematographer' | 'Producer';

export type ImageAspectRatio =
  | '1:1'
  | '2:3'
  | '3:2'
  | '3:4'
  | '4:3'
  | '9:16'
  | '16:9'
  | '21:9';

export type ImageResolutionSize = '1K' | '2K' | '4K';
export type VideoAspectRatio = '16:9' | '9:16';

export interface DramaInspirationPreset {
  id: string;
  title: string;
  subtitle: string;
  genre: string;
  prompt: string;
  durationEstimate: string;
  palette: {
    bgFrom: string;
    bgTo: string;
    accent: string;
  };
}

export interface StudioProjectRecord {
  id: string;
  ownerId: string;
  title: string;
  category: StudioCategory;
  genre: string;
  prompt: string;
  scriptText: string;
  status: ProjectStatus;
  mediaUrl?: string;
  audioUrl?: string;
  createdAtIso: string;
}

export const ID_REGEX = /^[a-zA-Z0-9_\-]+$/;

export const ALLOWED_CATEGORIES: StudioCategory[] = [
  'drama',
  'video',
  'image',
  'effects',
  'music',
];

export const ALLOWED_STATUSES: ProjectStatus[] = ['draft', 'published', 'archived'];

export const ALLOWED_STUDIO_ROLES: StudioRole[] = [
  'Director',
  'Screenwriter',
  'Cinematographer',
  'Producer',
];

export const IMAGE_ASPECT_RATIOS: ImageAspectRatio[] = [
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '9:16',
  '16:9',
  '21:9',
];

export const IMAGE_SIZES: ImageResolutionSize[] = ['1K', '2K', '4K'];

export const DRAMA_GENRES = ['Romance', 'Horror', 'Sci-Fi', 'Fantasy', 'Action'] as const;
export const VIDEO_STYLES = ['Cinematic', 'Anime', 'Realistic', '3D Render'] as const;
export const IMAGE_STYLES = ['Photorealistic', 'Digital Art', 'Oil Painting', 'Watercolor'] as const;
export const EFFECT_TYPES = ['Particle', 'Glitch', 'Morph', 'Neon'] as const;

export const DRAMA_INSPIRATION_PRESETS: DramaInspirationPreset[] = [
  {
    id: 'vampire-invitation',
    title: 'Vampire: The Invitation',
    subtitle: 'Gothic Romance · Episode 01',
    genre: 'Romance',
    prompt: 'Vampire invitation, gothic castle, mysterious aristocrat, candlelight, cinematic lighting',
    durationEstimate: '02:15',
    palette: { bgFrom: '#1E1633', bgTo: '#0F172A', accent: '#A78BFA' },
  },
  {
    id: 'alpha-destiny',
    title: "The Alpha's Destiny",
    subtitle: 'Supernatural Thriller · Episode 01',
    genre: 'Fantasy',
    prompt: 'Alpha werewolf destiny, silver moonlight, misty ancient pine forest, dramatic confrontation',
    durationEstimate: '02:40',
    palette: { bgFrom: '#132238', bgTo: '#0F172A', accent: '#38BDF8' },
  },
  {
    id: 'woman-revenge',
    title: "The Woman's Revenge",
    subtitle: 'Metropolitan Noir · Episode 01',
    genre: 'Action',
    prompt: 'Woman revenge, strong female lead, rain-slicked city lights, gala penthouse confrontation',
    durationEstimate: '03:05',
    palette: { bgFrom: '#331524', bgTo: '#0F172A', accent: '#F43F5E' },
  },
  {
    id: 'rancher-secret',
    title: "The Rancher's Secret",
    subtitle: 'Western Mystery · Episode 01',
    genre: 'Romance',
    prompt: 'Rancher secret, Montana frontier ranch at golden hour sunset, hidden family ledger',
    durationEstimate: '02:30',
    palette: { bgFrom: '#2E2113', bgTo: '#0F172A', accent: '#F59E0B' },
  },
  {
    id: 'fat-cat-adventure',
    title: "The Fat Cat's Big Adventure",
    subtitle: 'Animated Family Short · Episode 01',
    genre: 'Fantasy',
    prompt: 'Fat cat big adventure, chubby ginger cat wearing a miniature explorer satchel in a bustling harbor',
    durationEstimate: '01:50',
    palette: { bgFrom: '#2B2312', bgTo: '#0F172A', accent: '#FBBF24' },
  },
  {
    id: 'when-destiny-calls',
    title: 'When Destiny Calls',
    subtitle: 'Sci-Fi Melodrama · Episode 01',
    genre: 'Sci-Fi',
    prompt: 'Destiny calls, two star-crossed pilots beneath an aurora sky at an orbital launchpad',
    durationEstimate: '02:55',
    palette: { bgFrom: '#112A2E', bgTo: '#0F172A', accent: '#2DD4BF' },
  },
];

export const INITIAL_SEED_PROJECTS: StudioProjectRecord[] = [
  {
    id: 'seed_vampire_ep1',
    ownerId: 'demo_director',
    title: 'Vampire: The Invitation',
    category: 'drama',
    genre: 'Romance',
    prompt: 'Vampire invitation, gothic castle, mysterious aristocrat, candlelight, cinematic lighting',
    scriptText: [
      'TITLE: VAMPIRE: THE INVITATION (EPISODE 1)',
      'SETTING: INT. CASTLE CORVINUS GRAND BALLROOM - NIGHT',
      '',
      '[SCENE START]',
      'CAMERA: Slow dolly-in through rain-lashed stained glass. Warm candelabra reflections flicker across obsidian marble.',
      '',
      'JULIAN (30s, velvet tailcoat, composed intensity):',
      '"You crossed three rivers in a storm to deliver a letter with no seal, Elena. Either you are remarkably brave—or no one warned you whose name is carved above the gate."',
      '',
      'ELENA (20s, breathless, clutching the crimson parchment):',
      '"The clockmaker said the ink only appears at midnight. Look at the crest—it is yours."',
      '[SCENE END]',
    ].join('\n'),
    status: 'published',
    createdAtIso: '2026-10-24T18:30:00.000Z',
  },
  {
    id: 'seed_city_revenge',
    ownerId: 'demo_director',
    title: "The Woman's Revenge — Rooftop Overture",
    category: 'drama',
    genre: 'Action',
    prompt: 'Woman revenge, strong female lead, rain-slicked city lights, gala penthouse confrontation',
    scriptText: [
      'TITLE: THE WOMAN\'S REVENGE (OPENING SEQUENCE)',
      'SETTING: EXT. VERIDIAN TOWER SKYDECK - NIGHT',
      '',
      '[SCENE START]',
      'CAMERA: Crane shot descending from neon skyline to the glass terrace.',
      '',
      'CLAIRE (30s, crimson evening gown, calm precision):',
      '"Five years ago you bought every witness in this room. Tonight, I bought the bank that holds your debt."',
      '[SCENE END]',
    ].join('\n'),
    status: 'published',
    createdAtIso: '2026-10-24T19:15:00.000Z',
  },
];

export function isValidFirestoreId(id: unknown): id is string {
  return (
    typeof id === 'string' &&
    id.length >= 1 &&
    id.length <= 128 &&
    ID_REGEX.test(id)
  );
}

export function validateUserProfilePayload(payload: Record<string, unknown>): {
  valid: boolean;
  error?: string;
} {
  const allowedKeys = new Set(['uid', 'displayName', 'studioRole', 'createdAt', 'updatedAt']);
  const requiredKeys = ['uid', 'displayName', 'studioRole'];

  for (const reqKey of requiredKeys) {
    if (!(reqKey in payload)) {
      return { valid: false, error: `Missing required field: ${reqKey}` };
    }
  }

  for (const key of Object.keys(payload)) {
    if (!allowedKeys.has(key)) {
      return { valid: false, error: `Unexpected field in UserProfile: ${key}` };
    }
  }

  if (!isValidFirestoreId(payload.uid)) {
    return { valid: false, error: 'Invalid uid format or length' };
  }

  if (
    typeof payload.displayName !== 'string' ||
    payload.displayName.trim().length < 1 ||
    payload.displayName.length > 80
  ) {
    return { valid: false, error: 'displayName must be 1–80 characters' };
  }

  if (
    typeof payload.studioRole !== 'string' ||
    !ALLOWED_STUDIO_ROLES.includes(payload.studioRole as StudioRole)
  ) {
    return { valid: false, error: 'Invalid studioRole enum value' };
  }

  return { valid: true };
}

export function validateProjectPayload(payload: Record<string, unknown>): {
  valid: boolean;
  error?: string;
} {
  const allowedKeys = new Set([
    'ownerId',
    'title',
    'category',
    'genre',
    'prompt',
    'scriptText',
    'status',
    'createdAt',
    'updatedAt',
  ]);
  const requiredKeys = [
    'ownerId',
    'title',
    'category',
    'genre',
    'prompt',
    'scriptText',
    'status',
  ];

  for (const reqKey of requiredKeys) {
    if (!(reqKey in payload)) {
      return { valid: false, error: `Missing required field: ${reqKey}` };
    }
  }

  for (const key of Object.keys(payload)) {
    if (!allowedKeys.has(key)) {
      return { valid: false, error: `Disallowed shadow field: ${key}` };
    }
  }

  if (!isValidFirestoreId(payload.ownerId)) {
    return { valid: false, error: 'Invalid ownerId' };
  }

  if (
    typeof payload.title !== 'string' ||
    payload.title.trim().length < 1 ||
    payload.title.length > 140
  ) {
    return { valid: false, error: 'title must be 1–140 characters' };
  }

  if (
    typeof payload.category !== 'string' ||
    !ALLOWED_CATEGORIES.includes(payload.category as StudioCategory)
  ) {
    return { valid: false, error: 'Invalid category value' };
  }

  if (
    typeof payload.genre !== 'string' ||
    payload.genre.trim().length < 1 ||
    payload.genre.length > 60
  ) {
    return { valid: false, error: 'genre must be 1–60 characters' };
  }

  if (
    typeof payload.prompt !== 'string' ||
    payload.prompt.trim().length < 1 ||
    payload.prompt.length > 2000
  ) {
    return { valid: false, error: 'prompt must be 1–2000 characters' };
  }

  if (typeof payload.scriptText !== 'string' || payload.scriptText.length > 8000) {
    return { valid: false, error: 'scriptText must be 0–8000 characters' };
  }

  if (
    typeof payload.status !== 'string' ||
    !ALLOWED_STATUSES.includes(payload.status as ProjectStatus)
  ) {
    return { valid: false, error: 'Invalid status enum value' };
  }

  return { valid: true };
}

export function sanitizeProjectDraft(input: {
  ownerId: string;
  title: string;
  category: StudioCategory;
  genre: string;
  prompt: string;
  scriptText: string;
  status?: ProjectStatus;
}) {
  return {
    ownerId: input.ownerId.trim().slice(0, 128),
    title: (input.title.trim() || 'Untitled Studio Production').slice(0, 140),
    category: ALLOWED_CATEGORIES.includes(input.category) ? input.category : 'drama',
    genre: (input.genre.trim() || 'Cinematic').slice(0, 60),
    prompt: input.prompt.trim().slice(0, 2000),
    scriptText: (input.scriptText || '').slice(0, 8000),
    status: input.status && ALLOWED_STATUSES.includes(input.status) ? input.status : 'draft',
  };
}

export function normalizeSupportedImageAspectRatio(
  ratio: ImageAspectRatio
): '1:1' | '3:4' | '4:3' | '9:16' | '16:9' {
  switch (ratio) {
    case '1:1':
    case '3:4':
    case '4:3':
    case '9:16':
    case '16:9':
      return ratio;
    case '2:3':
      return '3:4';
    case '3:2':
      return '4:3';
    case '21:9':
      return '16:9';
    default:
      return '16:9';
  }
}

export function buildPosterSvgDataUri(options: {
  title: string;
  genre: string;
  category: string;
  prompt: string;
}): string {
  const safeTitle = options.title
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .slice(0, 48);
  const safeGenre = options.genre
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .slice(0, 30);
  const safePrompt = options.prompt
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .slice(0, 110);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1E1B4B"/>
        <stop offset="55%" stop-color="#0F172A"/>
        <stop offset="100%" stop-color="#31102F"/>
      </linearGradient>
    </defs>
    <rect width="800" height="450" fill="url(#bg)"/>
    <circle cx="650" cy="110" r="140" fill="#8B5CF6" fill-opacity="0.18"/>
    <circle cx="160" cy="360" r="180" fill="#F59E0B" fill-opacity="0.12"/>
    <rect x="48" y="48" width="704" height="354" rx="16" fill="none" stroke="#334155" stroke-width="1.5"/>
    <text x="80" y="105" font-family="sans-serif" font-size="13" font-weight="600" fill="#A78BFA" letter-spacing="2">MOVIE CITY STUDIO · ${safeGenre.toUpperCase()}</text>
    <text x="80" y="160" font-family="sans-serif" font-size="32" font-weight="700" fill="#F8FAFC">${safeTitle}</text>
    <text x="80" y="215" font-family="sans-serif" font-size="16" fill="#CBD5E1">"${safePrompt}"</text>
    <text x="80" y="365" font-family="monospace" font-size="13" fill="#94A3B8">FORMAT: ${options.category.toUpperCase()} · MASTER 24FPS</text>
  </svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
