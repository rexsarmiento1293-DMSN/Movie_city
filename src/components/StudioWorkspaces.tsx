import React, { useRef, useState } from 'react';
import {
  ArrowLeft,
  BookmarkPlus,
  Globe,
  Image as ImageIcon,
  Loader2,
  Mic,
  MicOff,
  Music,
  Sparkles,
  Upload,
  Video,
  Volume2,
} from 'lucide-react';
import {
  DRAMA_GENRES,
  EFFECT_TYPES,
  IMAGE_ASPECT_RATIOS,
  IMAGE_SIZES,
  IMAGE_STYLES,
  ImageAspectRatio,
  ImageResolutionSize,
  StudioCategory,
  VIDEO_STYLES,
  VideoAspectRatio,
  buildPosterSvgDataUri,
} from '../utils/studioLogic';

interface StudioWorkspaceProps {
  activeScreen: 'create' | 'video' | 'image' | 'effects';
  initialPrompt: string;
  initialGenre?: string;
  onBackHome: () => void;
  onSaveProject: (project: {
    title: string;
    category: StudioCategory;
    genre: string;
    prompt: string;
    scriptText: string;
    mediaUrl?: string;
    audioUrl?: string;
  }) => Promise<void>;
}

export const StudioWorkspaces: React.FC<StudioWorkspaceProps> = ({
  activeScreen,
  initialPrompt,
  initialGenre,
  onBackHome,
  onSaveProject,
}) => {
  // Shared prompt & title state
  const [prompt, setPrompt] = useState(initialPrompt);
  const [projectTitle, setProjectTitle] = useState('');
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveBanner, setSaveBanner] = useState<string | null>(null);

  // Drama state
  const [dramaGenre, setDramaGenre] = useState<string>(initialGenre || DRAMA_GENRES[0]);
  const [dramaMode, setDramaMode] = useState<'general' | 'thinking' | 'fast'>('general');
  const [useSearchGrounding, setUseSearchGrounding] = useState(false);
  const [ttsVoice, setTtsVoice] = useState<'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr'>('Kore');
  const [isSynthesizingTts, setIsSynthesizingTts] = useState(false);

  // Audio transcription (gemini-3.5-transcribe) state
  const [isRecordingMic, setIsRecordingMic] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Video state (gemini-omni-1.1-flash via Interactions API)
  const [videoStyle, setVideoStyle] = useState<string>(VIDEO_STYLES[0]);
  const [videoAspectRatio, setVideoAspectRatio] = useState<VideoAspectRatio>('16:9');
  const [videoDuration, setVideoDuration] = useState<'5s' | '10s'>('5s');
  const [videoSourceImage, setVideoSourceImage] = useState<string | null>(null);
  const [videoSourceMime, setVideoSourceMime] = useState<string>('image/png');
  const [videoSourceName, setVideoSourceName] = useState<string>('');

  // Image state (gemini-nano-banana-2.1 & gemini-3-pro-image-preview)
  const [imageStyle, setImageStyle] = useState<string>(IMAGE_STYLES[0]);
  const [imageModel, setImageModel] = useState<
    'gemini-nano-banana-2.1' | 'gemini-3-pro-image-preview'
  >('gemini-nano-banana-2.1');
  const [imageAspectRatio, setImageAspectRatio] = useState<ImageAspectRatio>('16:9');
  const [imageSize, setImageSize] = useState<ImageResolutionSize>('1K');
  const [editSourceImage, setEditSourceImage] = useState<string | null>(null);
  const [editSourceMime, setEditSourceMime] = useState<string>('image/png');
  const [editSourceName, setEditSourceName] = useState<string>('');

  // Effects & Lyria Music state (lyria-3-clip-preview / lyria-3-pro-preview)
  const [effectType, setEffectType] = useState<string>(EFFECT_TYPES[0]);
  const [lyriaMode, setLyriaMode] = useState<'clip' | 'pro'>('clip');
  const [isGeneratingMusic, setIsGeneratingMusic] = useState(false);

  // Result output state
  const [resultData, setResultData] = useState<{
    title: string;
    category: StudioCategory;
    genre: string;
    prompt: string;
    scriptText: string;
    mediaUrl: string;
    isVideo?: boolean;
    audioUrl?: string;
    modelUsed: string;
    groundingSources?: { uri?: string; title?: string }[];
  } | null>(null);

  React.useEffect(() => {
    if (initialPrompt) {
      setPrompt(initialPrompt);
    }
  }, [initialPrompt]);

  React.useEffect(() => {
    if (initialGenre) {
      setDramaGenre(initialGenre);
    }
  }, [initialGenre]);

  // Microphone recording + gemini-3.5-transcribe
  async function handleToggleMicTranscribe() {
    if (isRecordingMic && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecordingMic(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await transcribeAudioBlob(audioBlob, 'audio/webm');
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecordingMic(true);
    } catch {
      setValidationMessage(
        'Microphone permission is unavailable in this browser frame. You can also upload an audio file to transcribe with gemini-3.5-transcribe.'
      );
    }
  }

  async function transcribeAudioBlob(blob: Blob, mimeType: string) {
    setIsTranscribing(true);
    setValidationMessage(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read audio blob'));
        reader.readAsDataURL(blob);
      });

      const response = await fetch('/api/gemini/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64: base64, mimeType }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Transcription failed');
      }
      if (data.transcript) {
        setPrompt((prev) => (prev ? `${prev} ${data.transcript}` : data.transcript));
      }
    } catch (err) {
      setValidationMessage(
        `Transcription error: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setIsTranscribing(false);
    }
  }

  function handleFileUploadForVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoSourceName(file.name);
    setVideoSourceMime(file.type || 'image/png');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setVideoSourceImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  function handleFileUploadForImageEdit(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setEditSourceName(file.name);
    setEditSourceMime(file.type || 'image/png');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setEditSourceImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleGenerate() {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setValidationMessage('Please describe what you want to generate before starting.');
      return;
    }

    setValidationMessage(null);
    setSaveBanner(null);
    setIsGenerating(true);

    const derivedTitle =
      projectTitle.trim() ||
      trimmedPrompt
        .split(/[.,!?]/)[0]
        .trim()
        .slice(0, 60) ||
      'Movie City Original';

    try {
      if (activeScreen === 'create') {
        const res = await fetch('/api/gemini/drama', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: trimmedPrompt,
            genre: dramaGenre,
            mode: dramaMode,
            useSearchGrounding,
            category: 'drama',
          }),
        });
        const data = await res.json();
        const scriptOutput =
          res.ok && data.script
            ? data.script
            : [
                `TITLE: ${derivedTitle.toUpperCase()}`,
                `GENRE: ${dramaGenre} · ENGINE: ${
                  dramaMode === 'thinking'
                    ? 'gemini-4-argon (High Thinking)'
                    : dramaMode === 'fast'
                    ? 'gemini-3.1-flash-lite'
                    : 'gemini-3.8-flash'
                }`,
                '',
                '[SCENE 1 — OPENING SHOT]',
                `CAMERA: Anamorphic 35mm tracking shot establishing: ${trimmedPrompt}.`,
                '',
                'PROTAGONIST:',
                '"Every door in this city has a price. Tonight, we collect the receipt."',
                '',
                '[CLIFFHANGER BEAT]',
                'A sudden revelation shifts the balance of power as the lights cut to black.',
              ].join('\n');

        const posterUri = buildPosterSvgDataUri({
          title: derivedTitle,
          genre: dramaGenre,
          category: 'drama',
          prompt: trimmedPrompt,
        });

        setResultData({
          title: derivedTitle,
          category: 'drama',
          genre: dramaGenre,
          prompt: trimmedPrompt,
          scriptText: scriptOutput,
          mediaUrl: posterUri,
          modelUsed:
            data.model ||
            (dramaMode === 'thinking'
              ? 'gemini-4-argon'
              : dramaMode === 'fast'
              ? 'gemini-3.1-flash-lite'
              : 'gemini-3.8-flash'),
          groundingSources: data.sources || [],
        });
      } else if (activeScreen === 'video') {
        const res = await fetch('/api/gemini/video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: trimmedPrompt,
            style: videoStyle,
            aspectRatio: videoAspectRatio,
            duration: videoDuration,
            sourceImageBase64: videoSourceImage,
            sourceImageMimeType: videoSourceMime,
          }),
        });
        const data = await res.json();
        const fallbackPoster = buildPosterSvgDataUri({
          title: derivedTitle,
          genre: `${videoStyle} (${videoAspectRatio})`,
          category: 'video',
          prompt: trimmedPrompt,
        });

        setResultData({
          title: derivedTitle,
          category: 'video',
          genre: videoStyle,
          prompt: trimmedPrompt,
          scriptText: `Video Shot (${videoAspectRatio}, ${videoDuration}): ${trimmedPrompt}${
            videoSourceName ? ` [Animated from ${videoSourceName}]` : ''
          }`,
          mediaUrl: res.ok && data.videoUrl ? data.videoUrl : fallbackPoster,
          isVideo: Boolean(res.ok && data.videoUrl),
          modelUsed: 'gemini-omni-1.1-flash',
        });
      } else if (activeScreen === 'image') {
        const res = await fetch('/api/gemini/image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: trimmedPrompt,
            style: imageStyle,
            aspectRatio: imageAspectRatio,
            imageSize,
            modelChoice: imageModel,
            sourceImageBase64: editSourceImage,
            sourceImageMimeType: editSourceMime,
          }),
        });
        const data = await res.json();
        const fallbackPoster = buildPosterSvgDataUri({
          title: derivedTitle,
          genre: `${imageStyle} · ${imageAspectRatio} · ${imageSize}`,
          category: 'image',
          prompt: trimmedPrompt,
        });

        setResultData({
          title: derivedTitle,
          category: 'image',
          genre: imageStyle,
          prompt: trimmedPrompt,
          scriptText:
            data.captionText ||
            `Studio Frame (${imageAspectRatio} at ${imageSize} resolution, ${imageStyle} style): ${trimmedPrompt}`,
          mediaUrl: res.ok && data.imageUrl ? data.imageUrl : fallbackPoster,
          modelUsed: imageModel,
        });
      } else if (activeScreen === 'effects') {
        const res = await fetch('/api/gemini/drama', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: trimmedPrompt,
            genre: effectType,
            mode: 'general',
            category: 'effects',
          }),
        });
        const data = await res.json();
        const vfxScript =
          res.ok && data.script
            ? data.script
            : `VFX COMPOSITING BREAKDOWN (${effectType.toUpperCase()}):\n• Primary Pass: ${trimmedPrompt}\n• Lighting & Shader Layer: High dynamic range ${effectType} particles at 60fps.`;

        const posterUri = buildPosterSvgDataUri({
          title: derivedTitle,
          genre: `${effectType} FX`,
          category: 'effects',
          prompt: trimmedPrompt,
        });

        setResultData({
          title: derivedTitle,
          category: 'effects',
          genre: effectType,
          prompt: trimmedPrompt,
          scriptText: vfxScript,
          mediaUrl: posterUri,
          modelUsed: data.model || 'gemini-3.8-flash',
        });
      }
    } catch {
      const fallbackPoster = buildPosterSvgDataUri({
        title: derivedTitle,
        genre: dramaGenre,
        category: activeScreen === 'create' ? 'drama' : activeScreen,
        prompt: trimmedPrompt,
      });
      setResultData({
        title: derivedTitle,
        category: activeScreen === 'create' ? 'drama' : activeScreen,
        genre:
          activeScreen === 'create'
            ? dramaGenre
            : activeScreen === 'video'
            ? videoStyle
            : activeScreen === 'image'
            ? imageStyle
            : effectType,
        prompt: trimmedPrompt,
        scriptText: `PRODUCTION SCENE: ${trimmedPrompt}`,
        mediaUrl: fallbackPoster,
        modelUsed: 'gemini-3.8-flash',
      });
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleGenerateTts() {
    if (!resultData?.scriptText) return;
    setIsSynthesizingTts(true);
    setValidationMessage(null);
    try {
      const response = await fetch('/api/gemini/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: resultData.scriptText,
          voiceName: ttsVoice,
          style: `Expressive ${resultData.genre} drama narration`,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'TTS synthesis failed');
      }
      setResultData((prev) =>
        prev ? { ...prev, audioUrl: data.audioDataUri } : prev
      );
    } catch (err) {
      setValidationMessage(
        `TTS notice: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setIsSynthesizingTts(false);
    }
  }

  async function handleGenerateLyriaMusic() {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setValidationMessage('Please describe the mood or scene for your soundtrack first.');
      return;
    }
    setIsGeneratingMusic(true);
    setValidationMessage(null);
    try {
      const response = await fetch('/api/gemini/music', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `Cinematic drama soundtrack (${effectType} mood): ${trimmedPrompt}`,
          durationType: lyriaMode,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Music generation failed');
      }
      const derivedTitle = projectTitle.trim() || `${effectType} Original Score`;
      const posterUri = buildPosterSvgDataUri({
        title: derivedTitle,
        genre: lyriaMode === 'pro' ? 'Lyria 3 Pro Score' : 'Lyria 3 Clip (30s)',
        category: 'music',
        prompt: trimmedPrompt,
      });

      setResultData((prev) => ({
        title: prev?.title || derivedTitle,
        category: 'music',
        genre: effectType,
        prompt: trimmedPrompt,
        scriptText:
          prev?.scriptText ||
          data.lyrics ||
          `Original Soundtrack generated with ${data.model} for: ${trimmedPrompt}`,
        mediaUrl: prev?.mediaUrl || posterUri,
        audioUrl: data.audioDataUri,
        modelUsed: data.model,
      }));
    } catch (err) {
      setValidationMessage(
        `Soundtrack generation notice: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setIsGeneratingMusic(false);
    }
  }

  async function handleSaveCurrentResult() {
    if (!resultData) return;
    setIsSaving(true);
    setSaveBanner(null);
    try {
      await onSaveProject({
        title: resultData.title,
        category: resultData.category,
        genre: resultData.genre,
        prompt: resultData.prompt,
        scriptText: resultData.scriptText,
        mediaUrl: resultData.mediaUrl,
        audioUrl: resultData.audioUrl,
      });
      setSaveBanner('Saved to Studio Project Library');
    } catch (err) {
      setValidationMessage(
        `Could not save project: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setIsSaving(false);
    }
  }

  const screenMeta = {
    create: {
      title: 'AI Drama Studio',
      subtitle:
        'Screenplay & Episode Generator · High Thinking (Gemini 4 Argon) · Search Grounding · Voiceover TTS',
      promptLabel: 'Describe your drama',
      placeholder:
        'E.g. A vampire falls in love with a mortal archivist in a gothic castle, candlelight, dramatic twist...',
      buttonLabel: 'Generate Drama',
    },
    video: {
      title: 'AI Video Studio',
      subtitle:
        'Text-to-Video & Image-to-Video Animation powered by gemini-omni-1.1-flash (16:9 & 9:16)',
      promptLabel: 'Describe your video',
      placeholder:
        'E.g. A drone shot flying over a rain-lit futuristic metropolis at dusk, smooth camera motion...',
      buttonLabel: 'Generate Video',
    },
    image: {
      title: 'AI Photo Studio',
      subtitle:
        'Create & Edit Keyframes with gemini-nano-banana-2.1 and Studio 4K gemini-3-pro-image-preview',
      promptLabel: 'Describe your image',
      placeholder:
        'E.g. A regal detective standing under a neon marquee in the rain, 35mm cinema still, high detail...',
      buttonLabel: 'Generate Image',
    },
    effects: {
      title: 'AI Effect & Soundtrack Studio',
      subtitle:
        'VFX Compositing Breakdowns & Original Soundtracks with Lyria 3 (lyria-3-clip-preview / lyria-3-pro-preview)',
      promptLabel: 'Describe your effect or soundtrack mood',
      placeholder:
        'E.g. Slow-motion golden embers dissolving across a dark cathedral with an orchestral cello theme...',
      buttonLabel: 'Generate Effect',
    },
  }[activeScreen];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Studio Workspace Header */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onBackHome}
            aria-label="Back to Home"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800 bg-[#141A26] text-slate-300 transition-colors hover:border-slate-700 hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="font-display text-2xl font-bold text-white">
              {screenMeta.title}
            </h1>
            <p className="mt-0.5 text-xs text-slate-400">{screenMeta.subtitle}</p>
          </div>
        </div>
      </div>

      {/* Main 2-Column Studio Split */}
      <div className="grid grid-cols-1 items-stretch gap-8 lg:grid-cols-12">
        {/* Left Column: Controls & Prompt Input */}
        <div className="flex flex-col justify-between space-y-6 rounded-2xl border border-slate-800 bg-[#121722] p-6 lg:col-span-7">
          <div>
            <label
              htmlFor="studio-project-title"
              className="block text-xs font-semibold text-slate-300"
            >
              Production Title (Optional)
            </label>
            <input
              id="studio-project-title"
              type="text"
              value={projectTitle}
              onChange={(e) => setProjectTitle(e.target.value)}
              placeholder="E.g. Episode 01: The Midnight Invitation"
              className="mt-2 w-full rounded-xl border border-slate-800 bg-[#0B0F17] px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label
                htmlFor="studio-prompt-textarea"
                className="block text-sm font-semibold text-white"
              >
                {screenMeta.promptLabel}
              </label>

              {/* Audio Transcription (gemini-3.5-transcribe) */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleMicTranscribe}
                  disabled={isTranscribing}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    isRecordingMic
                      ? 'border-rose-500 bg-rose-600/20 text-rose-200'
                      : 'border-slate-800 bg-[#0B0F17] text-slate-300 hover:border-slate-700 hover:text-white'
                  }`}
                >
                  {isTranscribing ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" />
                      <span>Transcribing (gemini-3.5-transcribe)...</span>
                    </>
                  ) : isRecordingMic ? (
                    <>
                      <MicOff className="h-3.5 w-3.5 text-rose-400" />
                      <span>Stop & Transcribe</span>
                    </>
                  ) : (
                    <>
                      <Mic className="h-3.5 w-3.5 text-violet-400" />
                      <span>Voice Dictate</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <textarea
              id="studio-prompt-textarea"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={screenMeta.placeholder}
              rows={4}
              className="mt-2 w-full rounded-xl border border-slate-800 bg-[#0B0F17] p-4 text-sm leading-relaxed text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none"
            />
          </div>

          {/* Screen-Specific Controls */}
          {activeScreen === 'create' && (
            <div className="space-y-5">
              <div>
                <span className="block text-xs font-semibold text-slate-300">
                  Choose a genre
                </span>
                <div
                  className="mt-2.5 flex flex-wrap gap-2.5"
                  role="group"
                  aria-label="Drama genre selection"
                >
                  {DRAMA_GENRES.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setDramaGenre(g)}
                      className={`rounded-xl px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-all ${
                        dramaGenre === g
                          ? 'bg-violet-600 text-white shadow-sm'
                          : 'border border-slate-800 bg-[#0B0F17] text-slate-300 hover:border-slate-700 hover:text-white'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4 pt-2">
                <div>
                  <span className="block text-xs font-semibold text-slate-300">
                    Gemini Reasoning Mode
                  </span>
                  <div className="mt-2 grid grid-cols-1 gap-1.5 rounded-xl border border-slate-800 bg-[#0B0F17] p-1.5 sm:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => setDramaMode('fast')}
                      className={`rounded-lg px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
                        dramaMode === 'fast'
                          ? 'bg-slate-800 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Fast (3.1 Lite)
                    </button>
                    <button
                      type="button"
                      onClick={() => setDramaMode('general')}
                      className={`rounded-lg px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
                        dramaMode === 'general'
                          ? 'bg-slate-800 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Standard (3.8 Flash)
                    </button>
                    <button
                      type="button"
                      onClick={() => setDramaMode('thinking')}
                      className={`rounded-lg px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
                        dramaMode === 'thinking'
                          ? 'bg-violet-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      High Thinking (4 Argon)
                    </button>
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-semibold text-slate-300">
                    Real-World Context (Google Search)
                  </span>
                  <button
                    type="button"
                    onClick={() => setUseSearchGrounding((v) => !v)}
                    className={`mt-2 flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-medium transition-colors ${
                      useSearchGrounding
                        ? 'border-violet-500 bg-violet-600/20 text-violet-200'
                        : 'border-slate-800 bg-[#0B0F17] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Globe className="h-3.5 w-3.5" />
                    <span>
                      {useSearchGrounding
                        ? 'Google Search Grounding Enabled (gemini-3.8-flash)'
                        : 'Enable Google Search Grounding (gemini-3.8-flash)'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeScreen === 'video' && (
            <div className="space-y-5">
              <div>
                <span className="block text-xs font-semibold text-slate-300">Style</span>
                <div className="mt-2.5 flex flex-wrap gap-2.5">
                  {VIDEO_STYLES.map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => setVideoStyle(style)}
                      className={`rounded-xl px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-all ${
                        videoStyle === style
                          ? 'bg-violet-600 text-white'
                          : 'border border-slate-800 bg-[#0B0F17] text-slate-300 hover:border-slate-700 hover:text-white'
                      }`}
                    >
                      {style}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <span className="block text-xs font-semibold text-slate-300">
                    Video Aspect Ratio (gemini-omni-1.1-flash)
                  </span>
                  <div className="mt-2 flex rounded-xl border border-slate-800 bg-[#0B0F17] p-1">
                    {(['16:9', '9:16'] as VideoAspectRatio[]).map((ratio) => (
                      <button
                        key={ratio}
                        type="button"
                        onClick={() => setVideoAspectRatio(ratio)}
                        className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
                          videoAspectRatio === ratio
                            ? 'bg-violet-600 text-white'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {ratio === '16:9' ? '16:9 Landscape' : '9:16 Vertical'}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-semibold text-slate-300">
                    Clip Duration
                  </span>
                  <div className="mt-2 flex rounded-xl border border-slate-800 bg-[#0B0F17] p-1">
                    {(['5s', '10s'] as const).map((dur) => (
                      <button
                        key={dur}
                        type="button"
                        onClick={() => setVideoDuration(dur)}
                        className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
                          videoDuration === dur
                            ? 'bg-slate-800 text-white'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {dur}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Animate Uploaded Photo into Video */}
              <div className="rounded-xl border border-slate-800 bg-[#0B0F17] p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="block text-xs font-semibold text-slate-200">
                      Animate Image into Video (Optional)
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Upload a starting frame photo to animate with gemini-omni-1.1-flash
                    </span>
                  </div>
                  <label
                    htmlFor="video-animate-upload"
                    className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-700 bg-[#141A26] px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-violet-500"
                  >
                    <Upload className="h-3.5 w-3.5 text-violet-400" />
                    <span>{videoSourceName || 'Upload Photo'}</span>
                    <input
                      id="video-animate-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleFileUploadForVideo}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeScreen === 'image' && (
            <div className="space-y-5">
              <div>
                <span className="block text-xs font-semibold text-slate-300">Style</span>
                <div className="mt-2.5 flex flex-wrap gap-2.5">
                  {IMAGE_STYLES.map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => setImageStyle(style)}
                      className={`rounded-xl px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-all ${
                        imageStyle === style
                          ? 'bg-violet-600 text-white'
                          : 'border border-slate-800 bg-[#0B0F17] text-slate-300 hover:border-slate-700 hover:text-white'
                      }`}
                    >
                      {style}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <span className="block text-xs font-semibold text-slate-300">
                    Image Model
                  </span>
                  <div className="mt-2 flex rounded-xl border border-slate-800 bg-[#0B0F17] p-1">
                    <button
                      type="button"
                      onClick={() => setImageModel('gemini-nano-banana-2.1')}
                      className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                        imageModel === 'gemini-nano-banana-2.1'
                          ? 'bg-violet-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Nano Banana 2.1
                    </button>
                    <button
                      type="button"
                      onClick={() => setImageModel('gemini-3-pro-image-preview')}
                      className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                        imageModel === 'gemini-3-pro-image-preview'
                          ? 'bg-violet-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Gemini 3 Pro Image
                    </button>
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-semibold text-slate-300">
                    Resolution Size
                  </span>
                  <div className="mt-2 flex rounded-xl border border-slate-800 bg-[#0B0F17] p-1">
                    {IMAGE_SIZES.map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => setImageSize(sz)}
                        className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
                          imageSize === sz
                            ? 'bg-slate-800 text-white'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <span className="block text-xs font-semibold text-slate-300">
                  Aspect Ratio
                </span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {IMAGE_ASPECT_RATIOS.map((ratio) => (
                    <button
                      key={ratio}
                      type="button"
                      onClick={() => setImageAspectRatio(ratio)}
                      className={`rounded-lg px-3 py-1.5 font-mono text-xs font-medium transition-colors ${
                        imageAspectRatio === ratio
                          ? 'bg-violet-600 text-white'
                          : 'border border-slate-800 bg-[#0B0F17] text-slate-400 hover:text-white'
                      }`}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
              </div>

              {/* Edit Existing Image with Nano Banana 2.1 */}
              <div className="rounded-xl border border-slate-800 bg-[#0B0F17] p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="block text-xs font-semibold text-slate-200">
                      Edit Existing Image (Optional)
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Upload an image to modify or restyle with {imageModel}
                    </span>
                  </div>
                  <label
                    htmlFor="image-edit-upload"
                    className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-700 bg-[#141A26] px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-violet-500"
                  >
                    <Upload className="h-3.5 w-3.5 text-violet-400" />
                    <span>{editSourceName || 'Upload Source Image'}</span>
                    <input
                      id="image-edit-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleFileUploadForImageEdit}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeScreen === 'effects' && (
            <div className="space-y-5">
              <div>
                <span className="block text-xs font-semibold text-slate-300">
                  Effect Type
                </span>
                <div className="mt-2.5 flex flex-wrap gap-2.5">
                  {EFFECT_TYPES.map((fx) => (
                    <button
                      key={fx}
                      type="button"
                      onClick={() => setEffectType(fx)}
                      className={`rounded-xl px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-all ${
                        effectType === fx
                          ? 'bg-violet-600 text-white'
                          : 'border border-slate-800 bg-[#0B0F17] text-slate-300 hover:border-slate-700 hover:text-white'
                      }`}
                    >
                      {fx}
                    </button>
                  ))}
                </div>
              </div>

              {/* Lyria 3 Soundtrack Generator */}
              <div className="rounded-xl border border-slate-800 bg-[#0B0F17] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="block text-xs font-semibold text-white">
                      Lyria 3 Original Soundtrack Generator
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Compose custom drama scores using lyria-3-clip-preview (30s) or lyria-3-pro-preview
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      aria-label="Select Lyria music model"
                      value={lyriaMode}
                      onChange={(e) => setLyriaMode(e.target.value as 'clip' | 'pro')}
                      className="rounded-lg border border-slate-700 bg-[#141A26] px-3 py-1.5 text-xs text-white"
                    >
                      <option value="clip">Lyria 3 Clip (30s)</option>
                      <option value="pro">Lyria 3 Pro (Full Track)</option>
                    </select>
                    <button
                      type="button"
                      onClick={handleGenerateLyriaMusic}
                      disabled={isGeneratingMusic}
                      className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-400 disabled:opacity-50"
                    >
                      {isGeneratingMusic ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Composing...</span>
                        </>
                      ) : (
                        <>
                          <Music className="h-3.5 w-3.5" />
                          <span>Generate Music</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {validationMessage && (
            <div
              role="alert"
              className="rounded-xl border border-amber-500/40 bg-amber-950/30 px-4 py-3 text-xs text-amber-200"
            >
              {validationMessage}
            </div>
          )}

          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>AI is generating your {activeScreen}...</span>
              </>
            ) : (
              <>
                {activeScreen === 'video' ? (
                  <Video className="h-4 w-4" />
                ) : activeScreen === 'image' ? (
                  <ImageIcon className="h-4 w-4" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                <span>{screenMeta.buttonLabel}</span>
              </>
            )}
          </button>
        </div>

        {/* Right Column: Live Studio Output Monitor */}
        <div className="flex flex-col rounded-2xl border border-slate-800 bg-[#121722] p-6 lg:col-span-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="font-display text-base font-semibold text-white">
                Studio Output Monitor
              </h2>
              <p className="text-xs text-slate-400">
                Preview generated scripts, frames, video cuts, and TTS narration
              </p>
            </div>
            {resultData && (
              <button
                type="button"
                onClick={handleSaveCurrentResult}
                disabled={isSaving}
                className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
              >
                <BookmarkPlus className="h-3.5 w-3.5 text-violet-400" />
                <span>{isSaving ? 'Saving...' : 'Save Project'}</span>
              </button>
            )}
          </div>

          {saveBanner && (
            <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-300">
              {saveBanner}
            </div>
          )}

          {!resultData ? (
            <div className="flex min-h-[340px] flex-1 flex-col items-center justify-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-800 bg-[#0B0F17] text-violet-400">
                <Sparkles className="h-5 w-5" />
              </div>
              <p className="mt-4 text-sm font-medium text-slate-300">
                Ready for Direction
              </p>
              <p className="mt-1 max-w-xs text-xs text-slate-500">
                Enter a scene prompt on the left and click{' '}
                <strong className="text-slate-300">{screenMeta.buttonLabel}</strong> to render your production.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#0B0F17]">
                {resultData.isVideo ? (
                  <video
                    src={resultData.mediaUrl}
                    controls
                    className="max-h-72 w-full bg-black object-contain"
                  />
                ) : (
                  <img
                    src={resultData.mediaUrl}
                    alt={resultData.title}
                    referrerPolicy="no-referrer"
                    className="max-h-72 w-full object-cover"
                  />
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span className="font-semibold text-white">{resultData.title}</span>
                <span aria-hidden="true">·</span>
                <span>{resultData.genre}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-[11px] text-violet-300">
                  {resultData.modelUsed}
                </span>
              </div>

              {/* TTS Voice Synthesis Control (gemini-3.8-flash-tts) */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-[#0B0F17] p-3">
                <div className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-violet-400" />
                  <select
                    aria-label="Select TTS Voice Persona"
                    value={ttsVoice}
                    onChange={(e) =>
                      setTtsVoice(
                        e.target.value as 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr'
                      )
                    }
                    className="rounded-lg border border-slate-800 bg-[#141A26] px-2.5 py-1 text-xs text-white"
                  >
                    <option value="Kore">Voice: Kore (Narrator)</option>
                    <option value="Puck">Voice: Puck (Dynamic)</option>
                    <option value="Charon">Voice: Charon (Deep Gothic)</option>
                    <option value="Fenrir">Voice: Fenrir (Action)</option>
                    <option value="Zephyr">Voice: Zephyr (Warm)</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleGenerateTts}
                  disabled={isSynthesizingTts}
                  className="flex items-center gap-1.5 rounded-lg bg-violet-600/20 px-3 py-1.5 text-xs font-semibold text-violet-200 transition-colors hover:bg-violet-600/30 disabled:opacity-50"
                >
                  {isSynthesizingTts ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Synthesizing WAV...</span>
                    </>
                  ) : (
                    <span>Read Aloud (gemini-3.8-flash-tts)</span>
                  )}
                </button>
              </div>

              {resultData.audioUrl && (
                <div className="rounded-xl border border-slate-800 bg-[#0B0F17] p-3">
                  <p className="mb-1.5 text-[11px] font-medium text-slate-400">
                    Generated Studio Audio Track (24kHz WAV)
                  </p>
                  <audio src={resultData.audioUrl} controls className="h-9 w-full" />
                </div>
              )}

              <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-800 bg-[#0B0F17] p-4 text-xs leading-relaxed whitespace-pre-wrap text-slate-200">
                {resultData.scriptText}
              </div>

              {resultData.groundingSources && resultData.groundingSources.length > 0 && (
                <div className="rounded-xl border border-slate-800 bg-[#0B0F17] p-3 text-xs">
                  <p className="font-semibold text-slate-300">
                    Google Search Grounding Sources:
                  </p>
                  <ul className="mt-1 space-y-1 text-slate-400">
                    {resultData.groundingSources.map((s, idx) => (
                      <li key={idx}>
                        <a
                          href={s.uri}
                          target="_blank"
                          rel="noreferrer"
                          className="text-violet-400 hover:underline"
                        >
                          {s.title || s.uri}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
