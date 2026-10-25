import React, { useEffect, useState } from 'react';
import {
  Clapperboard,
  Film,
  Home as HomeIcon,
  Image as ImageIcon,
  LogIn,
  LogOut,
  MessageSquare,
  Radio,
  Sparkles,
  Trash2,
  Video,
} from 'lucide-react';
import {
  DRAMA_INSPIRATION_PRESETS,
  INITIAL_SEED_PROJECTS,
  StudioCategory,
  StudioProjectRecord,
} from './utils/studioLogic';
import {
  User,
  auth,
  createStudioProjectInFirestore,
  deleteStudioProjectFromFirestore,
  onAuthStateChanged,
  signInDirectorWithGoogle,
  signOutDirector,
  subscribeToDirectorProjects,
} from './firebase';
import { StudioWorkspaces } from './components/StudioWorkspaces';
import { LiveDirectorModal } from './components/LiveDirectorModal';

type ScreenId = 'home' | 'create' | 'video' | 'image' | 'effects';

export default function App() {
  const [showSplash, setShowSplash] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') {
        return false;
      }
    }
    return true;
  });

  const [activeScreen, setActiveScreen] = useState<ScreenId>('home');
  const [selectedPrompt, setSelectedPrompt] = useState<string>('');
  const [selectedGenre, setSelectedGenre] = useState<string>('Romance');

  // Firebase Auth & Firestore Projects state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [projects, setProjects] = useState<StudioProjectRecord[]>(INITIAL_SEED_PROJECTS);
  const [projectFilter, setProjectFilter] = useState<'all' | StudioCategory>('all');
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  // Director Suite Modal state (Multi-turn Chat, Live API Voice, Media Analyzer)
  const [isSuiteOpen, setIsSuiteOpen] = useState(false);
  const [suiteInitialTab, setSuiteInitialTab] = useState<'chat' | 'live' | 'analyze'>('chat');

  useEffect(() => {
    if (!showSplash) return;
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 900);
    return () => clearTimeout(timer);
  }, [showSplash]);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthReady(true);
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!authReady || !currentUser) {
      setProjects(INITIAL_SEED_PROJECTS);
      return;
    }

    const unsubProjects = subscribeToDirectorProjects(
      currentUser.uid,
      (cloudProjects) => {
        setProjects(
          cloudProjects.length > 0
            ? cloudProjects
            : INITIAL_SEED_PROJECTS
        );
      },
      (err) => {
        setAuthNotice(`Cloud sync note: ${err.message}`);
      }
    );

    return () => unsubProjects();
  }, [authReady, currentUser]);

  function navigateToScreen(screen: ScreenId, presetPrompt?: string, presetGenre?: string) {
    if (presetPrompt !== undefined) {
      setSelectedPrompt(presetPrompt);
    }
    if (presetGenre !== undefined) {
      setSelectedGenre(presetGenre);
    }
    setActiveScreen(screen);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleGoogleAuthClick() {
    setAuthNotice(null);
    if (currentUser) {
      await signOutDirector();
      return;
    }
    try {
      await signInDirectorWithGoogle();
    } catch (err) {
      setAuthNotice(
        err instanceof Error
          ? `Sign-in notice: ${err.message}`
          : 'Google Sign-In could not be completed in this preview window.'
      );
    }
  }

  async function handleSaveProject(newProj: {
    title: string;
    category: StudioCategory;
    genre: string;
    prompt: string;
    scriptText: string;
    mediaUrl?: string;
    audioUrl?: string;
  }) {
    const localEntry: StudioProjectRecord = {
      id: `local_${Date.now()}`,
      ownerId: currentUser?.uid || 'local_director',
      title: newProj.title,
      category: newProj.category,
      genre: newProj.genre,
      prompt: newProj.prompt,
      scriptText: newProj.scriptText,
      status: 'published',
      mediaUrl: newProj.mediaUrl,
      audioUrl: newProj.audioUrl,
      createdAtIso: new Date().toISOString(),
    };
    setProjects((prev) => [localEntry, ...prev]);

    if (currentUser) {
      await createStudioProjectInFirestore({
        ownerId: currentUser.uid,
        title: newProj.title,
        category: newProj.category,
        genre: newProj.genre,
        prompt: newProj.prompt,
        scriptText: newProj.scriptText,
        status: 'published',
      });
    }
  }

  async function handleDeleteProject(projectId: string) {
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    if (currentUser && projectId.startsWith('proj_')) {
      await deleteStudioProjectFromFirestore(projectId);
    }
  }

  const filteredProjects =
    projectFilter === 'all'
      ? projects
      : projects.filter((p) => p.category === projectFilter);

  return (
    <div className="min-h-screen bg-[#0B0F17] pb-24 text-slate-100 md:pb-12">
      {/* Splash Overlay */}
      {showSplash && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0B0F17] px-4 text-center"
          role="dialog"
          aria-label="Movie City Studio Loading Screen"
        >
          <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-violet-600 shadow-xl">
            <Clapperboard className="h-12 w-12 text-white" />
          </div>
          <h1 className="mt-6 font-display text-3xl font-bold tracking-tight text-white">
            Movie City
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            AI Drama Studio · Initializing Cinema Engines
          </p>
          <button
            type="button"
            onClick={() => setShowSplash(false)}
            className="mt-6 rounded-xl border border-slate-800 bg-[#141A26] px-5 py-2.5 text-xs font-semibold text-slate-200 hover:border-violet-500 hover:text-white"
          >
            Enter Studio →
          </button>
        </div>
      )}

      {/* Top Navigation Bar — Strict 3-Zone Contract */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-8 border-b border-slate-800/80 bg-[#0B0F17]/95 px-6 py-4 backdrop-blur-md">
        {/* Zone 1: Single text element wordmark */}
        <button
          type="button"
          onClick={() => navigateToScreen('home')}
          className="font-display text-xl font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          Movie City
        </button>

        {/* Zone 2: 5 concise single-line text navigation links */}
        <nav
          aria-label="Primary Studio Navigation"
          className="hidden items-center gap-6 text-sm font-medium text-slate-400 md:flex"
        >
          <button
            type="button"
            onClick={() => navigateToScreen('home')}
            className={`transition-colors whitespace-nowrap shrink-0 ${
              activeScreen === 'home'
                ? 'text-white underline decoration-violet-500 decoration-2 underline-offset-8'
                : 'hover:text-white'
            }`}
          >
            Home
          </button>
          <button
            type="button"
            onClick={() => navigateToScreen('create')}
            className={`transition-colors whitespace-nowrap shrink-0 ${
              activeScreen === 'create'
                ? 'text-white underline decoration-violet-500 decoration-2 underline-offset-8'
                : 'hover:text-white'
            }`}
          >
            AI Drama
          </button>
          <button
            type="button"
            onClick={() => navigateToScreen('video')}
            className={`transition-colors whitespace-nowrap shrink-0 ${
              activeScreen === 'video'
                ? 'text-white underline decoration-violet-500 decoration-2 underline-offset-8'
                : 'hover:text-white'
            }`}
          >
            AI Video
          </button>
          <button
            type="button"
            onClick={() => navigateToScreen('image')}
            className={`transition-colors whitespace-nowrap shrink-0 ${
              activeScreen === 'image'
                ? 'text-white underline decoration-violet-500 decoration-2 underline-offset-8'
                : 'hover:text-white'
            }`}
          >
            AI Photo
          </button>
          <button
            type="button"
            onClick={() => navigateToScreen('effects')}
            className={`transition-colors whitespace-nowrap shrink-0 ${
              activeScreen === 'effects'
                ? 'text-white underline decoration-violet-500 decoration-2 underline-offset-8'
                : 'hover:text-white'
            }`}
          >
            AI Effect
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleGoogleAuthClick}
            className="flex items-center gap-2 rounded-xl border border-slate-700 bg-[#151C2A] px-4 py-2 text-xs font-semibold text-white transition-colors hover:border-violet-500 hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            {currentUser ? (
              <>
                <LogOut className="h-3.5 w-3.5 text-violet-400" />
                <span>Sign Out ({currentUser.displayName?.split(' ')[0] || 'Director'})</span>
              </>
            ) : (
              <>
                <LogIn className="h-3.5 w-3.5 text-violet-400" />
                <span>Sign in with Google</span>
              </>
            )}
          </button>
        </div>
      </header>

      {authNotice && (
        <div className="mx-auto mt-4 max-w-7xl px-6">
          <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-[#121722] px-4 py-2.5 text-xs text-slate-300">
            <span>{authNotice}</span>
            <button
              type="button"
              onClick={() => setAuthNotice(null)}
              className="text-slate-400 hover:text-white"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Content Viewport */}
      <main>
        {activeScreen === 'home' ? (
          <div className="mx-auto max-w-7xl space-y-12 px-4 py-8 sm:px-6 lg:px-8">
            {/* Hero Section */}
            <section className="grid grid-cols-1 items-stretch gap-6 rounded-3xl border border-slate-800/90 bg-gradient-to-br from-[#16182E] via-[#1E1636] to-[#2A1B18] p-6 sm:p-10 lg:grid-cols-12">
              <div className="flex flex-col justify-between lg:col-span-7">
                <div>
                  <p className="text-xs font-medium text-violet-300">
                    AI Drama Studio · Totoong AI na — gumagawa ng totoong images, videos & stories
                  </p>
                  <h1 className="mt-3 font-display text-3xl font-bold leading-tight text-white sm:text-4xl lg:text-5xl">
                    Good afternoon, Director. What story are we making today?
                  </h1>
                  <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
                    Write multi-scene short dramas with Gemini 4 Argon High Thinking, synthesize character narration with Gemini 3.8 Flash TTS, animate storyboards with Omni Flash Video, and score soundtracks with Lyria 3.
                  </p>
                </div>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => navigateToScreen('create')}
                    className="rounded-full bg-white px-5 py-3 text-xs font-bold text-slate-950 shadow-lg transition-transform hover:bg-slate-100 active:scale-98 whitespace-nowrap sm:text-sm"
                  >
                    Start creating short dramas →
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSuiteInitialTab('chat');
                      setIsSuiteOpen(true);
                    }}
                    className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-3 text-xs font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/15 whitespace-nowrap"
                  >
                    <MessageSquare className="h-4 w-4 text-violet-300" />
                    <span>Director Chat & Media Lab</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSuiteInitialTab('live');
                      setIsSuiteOpen(true);
                    }}
                    className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-3 text-xs font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/15 whitespace-nowrap"
                  >
                    <Radio className="h-4 w-4 text-amber-300" />
                    <span>Live Voice Room</span>
                  </button>
                </div>
              </div>

              {/* Right Hero Feature Showcase */}
              <div className="flex flex-col justify-between rounded-2xl border border-white/10 bg-black/30 p-6 backdrop-blur-sm lg:col-span-5">
                <div>
                  <span className="text-xs font-medium text-slate-400">
                    Active Production Pipeline
                  </span>
                  <h2 className="mt-1 font-display text-lg font-semibold text-white">
                    End-to-End Short Drama Creation
                  </h2>
                  <p className="mt-2 text-xs leading-relaxed text-slate-300">
                    Select any inspiration card below or launch a studio tool to generate scripts, 1K–4K keyframes, 16:9 or 9:16 video clips, and WAV voiceovers.
                  </p>
                </div>

                {/* 4 Studio Tool Cards */}
                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => navigateToScreen('create')}
                    className="flex flex-col items-start rounded-xl border border-slate-800 bg-[#121722]/90 p-3.5 text-left transition-colors hover:border-violet-500"
                  >
                    <Film className="h-5 w-5 text-violet-400" />
                    <span className="mt-2 text-xs font-bold text-white">AI Drama</span>
                    <span className="mt-0.5 text-[11px] text-slate-400">
                      Script · TTS · Search
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => navigateToScreen('video')}
                    className="flex flex-col items-start rounded-xl border border-slate-800 bg-[#121722]/90 p-3.5 text-left transition-colors hover:border-violet-500"
                  >
                    <Video className="h-5 w-5 text-amber-400" />
                    <span className="mt-2 text-xs font-bold text-white">AI Video</span>
                    <span className="mt-0.5 text-[11px] text-slate-400">
                      Omni 1.1 · 16:9 & 9:16
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => navigateToScreen('image')}
                    className="flex flex-col items-start rounded-xl border border-slate-800 bg-[#121722]/90 p-3.5 text-left transition-colors hover:border-violet-500"
                  >
                    <ImageIcon className="h-5 w-5 text-emerald-400" />
                    <span className="mt-2 text-xs font-bold text-white">AI Photo</span>
                    <span className="mt-0.5 text-[11px] text-slate-400">
                      1K / 2K / 4K Studio
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => navigateToScreen('effects')}
                    className="flex flex-col items-start rounded-xl border border-slate-800 bg-[#121722]/90 p-3.5 text-left transition-colors hover:border-violet-500"
                  >
                    <Sparkles className="h-5 w-5 text-pink-400" />
                    <span className="mt-2 text-xs font-bold text-white">AI Effect</span>
                    <span className="mt-0.5 text-[11px] text-slate-400">
                      VFX & Lyria 3 Score
                    </span>
                  </button>
                </div>
              </div>
            </section>

            {/* Section 1: Drama Inspiration Grid (Tap to Generate) */}
            <section aria-labelledby="drama-inspiration-heading">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2
                    id="drama-inspiration-heading"
                    className="font-display text-xl font-bold text-white"
                  >
                    01. Drama Inspiration (Tap to Generate)
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">
                    Select a premise to load its director prompt and cinematography preset in the AI Drama Studio
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {DRAMA_INSPIRATION_PRESETS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      navigateToScreen('create', item.prompt, item.genre)
                    }
                    style={{
                      backgroundImage: `linear-gradient(145deg, ${item.palette.bgFrom} 0%, ${item.palette.bgTo} 100%)`,
                    }}
                    className="group relative flex h-48 flex-col justify-between overflow-hidden rounded-2xl border border-slate-800 p-5 text-left transition-all hover:border-violet-500/70"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-300">
                      <span>{item.subtitle}</span>
                      <span className="font-mono tabular-nums text-slate-400">
                        {item.durationEstimate}
                      </span>
                    </div>

                    <div>
                      <h3 className="font-display text-lg font-bold tracking-wide text-white group-hover:text-violet-200">
                        {item.title.toUpperCase()}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-300/90">
                        {item.prompt}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            {/* Section 2: Studio Project Library (Persisted with Firestore) */}
            <section aria-labelledby="studio-library-heading">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2
                    id="studio-library-heading"
                    className="font-display text-xl font-bold text-white"
                  >
                    02. Studio Production Library
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">
                    {currentUser
                      ? `Synced with Firebase Firestore (${currentUser.email || currentUser.uid})`
                      : 'Sign in with Google in the top bar to persist your productions across devices'}
                  </p>
                </div>

                {/* Interactive Filter Controls */}
                <div
                  className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-800 bg-[#121722] p-1"
                  role="group"
                  aria-label="Filter projects by category"
                >
                  {(['all', 'drama', 'video', 'image', 'effects', 'music'] as const).map(
                    (cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setProjectFilter(cat)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize whitespace-nowrap transition-colors ${
                          projectFilter === cat
                            ? 'bg-violet-600 text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {cat}
                      </button>
                    )
                  )}
                </div>
              </div>

              {filteredProjects.length === 0 ? (
                <div className="rounded-2xl border border-slate-800 bg-[#121722] p-8 text-center">
                  <p className="text-sm font-medium text-slate-300">
                    No productions in this category yet
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Generate a drama, video, photo, or soundtrack and click Save Project.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigateToScreen('create')}
                    className="mt-4 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-500"
                  >
                    Create First Production
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {filteredProjects.map((proj) => (
                    <article
                      key={proj.id}
                      className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-[#121722] p-5"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                          <div>
                            <span className="uppercase">{proj.category}</span>
                            <span aria-hidden="true"> · </span>
                            <span>{proj.genre}</span>
                            <span aria-hidden="true"> · </span>
                            <span className="font-mono tabular-nums">
                              {proj.createdAtIso.slice(0, 10)}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteProject(proj.id)}
                            aria-label={`Delete ${proj.title}`}
                            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-rose-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        <h3 className="mt-2 font-display text-base font-bold text-white">
                          {proj.title}
                        </h3>
                        <p className="mt-1 text-xs text-slate-400">
                          Prompt: {proj.prompt}
                        </p>
                        <div className="mt-3 max-h-36 overflow-y-auto rounded-xl border border-slate-800/80 bg-[#0B0F17] p-3 text-xs leading-relaxed whitespace-pre-wrap text-slate-300">
                          {proj.scriptText}
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between pt-2 text-xs">
                        <button
                          type="button"
                          onClick={() =>
                            navigateToScreen(
                              proj.category === 'music'
                                ? 'effects'
                                : proj.category === 'drama'
                                ? 'create'
                                : proj.category,
                              proj.prompt,
                              proj.genre
                            )
                          }
                          className="font-semibold text-violet-400 hover:text-violet-300"
                        >
                          Open in Studio →
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : (
          <StudioWorkspaces
            activeScreen={activeScreen}
            initialPrompt={selectedPrompt}
            initialGenre={selectedGenre}
            onBackHome={() => navigateToScreen('home')}
            onSaveProject={handleSaveProject}
          />
        )}
      </main>

      {/* Mobile Bottom Navigation Bar (<= 15% viewport height) */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className="fixed right-3 bottom-3 left-3 z-30 grid grid-cols-5 gap-1 rounded-full border border-slate-800 bg-[#141A26]/95 p-1.5 backdrop-blur-lg md:hidden"
      >
        <button
          type="button"
          onClick={() => navigateToScreen('home')}
          className={`flex items-center justify-center gap-1 rounded-full px-2 py-2 text-[11px] font-bold whitespace-nowrap ${
            activeScreen === 'home'
              ? 'bg-violet-600 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <HomeIcon className="h-3.5 w-3.5 shrink-0" />
          <span>Home</span>
        </button>
        <button
          type="button"
          onClick={() => navigateToScreen('create')}
          className={`flex items-center justify-center gap-1 rounded-full px-2 py-2 text-[11px] font-bold whitespace-nowrap ${
            activeScreen === 'create'
              ? 'bg-violet-600 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Film className="h-3.5 w-3.5 shrink-0" />
          <span>Drama</span>
        </button>
        <button
          type="button"
          onClick={() => navigateToScreen('video')}
          className={`flex items-center justify-center gap-1 rounded-full px-2 py-2 text-[11px] font-bold whitespace-nowrap ${
            activeScreen === 'video'
              ? 'bg-violet-600 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Video className="h-3.5 w-3.5 shrink-0" />
          <span>Video</span>
        </button>
        <button
          type="button"
          onClick={() => navigateToScreen('image')}
          className={`flex items-center justify-center gap-1 rounded-full px-2 py-2 text-[11px] font-bold whitespace-nowrap ${
            activeScreen === 'image'
              ? 'bg-violet-600 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <ImageIcon className="h-3.5 w-3.5 shrink-0" />
          <span>Photo</span>
        </button>
        <button
          type="button"
          onClick={() => navigateToScreen('effects')}
          className={`flex items-center justify-center gap-1 rounded-full px-2 py-2 text-[11px] font-bold whitespace-nowrap ${
            activeScreen === 'effects'
              ? 'bg-violet-600 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
          <span>Effect</span>
        </button>
      </nav>

      {/* Studio Director Suite Modal (Chat, Live Voice API, Media Analyzer) */}
      <LiveDirectorModal
        isOpen={isSuiteOpen}
        onClose={() => setIsSuiteOpen(false)}
        initialTab={suiteInitialTab}
        onApplyPromptToDrama={(newPrompt) => {
          navigateToScreen('create', newPrompt, 'Romance');
        }}
      />
    </div>
  );
}
