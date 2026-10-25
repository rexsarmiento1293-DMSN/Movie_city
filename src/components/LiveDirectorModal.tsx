import React, { useEffect, useRef, useState } from 'react';
import {
  FileVideo,
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  Radio,
  Send,
  Upload,
  X,
} from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  modelUsed?: string;
}

interface LiveDirectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'chat' | 'live' | 'analyze';
  onApplyPromptToDrama: (promptText: string) => void;
}

function float32ToPcm16Base64(float32Array: Float32Array): string {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export const LiveDirectorModal: React.FC<LiveDirectorModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'chat',
  onApplyPromptToDrama,
}) => {
  const [activeTab, setActiveTab] = useState<'chat' | 'live' | 'analyze'>(initialTab);

  // Multi-turn Gemini Chatbot state
  const [chatModel, setChatModel] = useState<
    'gemini-3.8-flash' | 'gemini-4-argon' | 'gemini-3.1-flash-lite'
  >('gemini-3.8-flash');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: 'Welcome to the Director Room. Pitch me a drama concept, ask for dialogue rewrites, or switch to High Thinking (Gemini 4 Argon) for multi-episode story arcs.',
      modelUsed: 'gemini-3.8-flash',
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // Live API (gemini-3.8-live) state
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [liveStatusText, setLiveStatusText] = useState('Ready to connect to Gemini 3.8 Live');
  const [liveTranscripts, setLiveTranscripts] = useState<string[]>([]);
  const [liveTextPrompt, setLiveTextPrompt] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef<number>(0);

  // Media Analyzer (gemini-4-argon for image & video understanding)
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const [mediaMimeType, setMediaMimeType] = useState<string>('image/png');
  const [mediaFileName, setMediaFileName] = useState<string>('');
  const [analysisPrompt, setAnalysisPrompt] = useState(
    'Analyze this shot for lighting, camera framing, dramatic tension, and suggest the next scene beat.'
  );
  const [analysisResult, setAnalysisResult] = useState<string>('');
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    return () => {
      stopLiveSession();
    };
  }, []);

  if (!isOpen) return null;

  async function handleSendChat(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;
    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      text: chatInput.trim(),
    };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setChatInput('');
    setChatLoading(true);
    setChatError(null);

    try {
      const response = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextHistory.map((m) => ({ role: m.role, text: m.text })),
          model: chatModel,
          enableHighThinking: chatModel === 'gemini-4-argon',
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Chat request failed');
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `model_${Date.now()}`,
          role: 'model',
          text: data.reply || 'No response received.',
          modelUsed: data.model,
        },
      ]);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : String(err));
    } finally {
      setChatLoading(false);
    }
  }

  function playPcm24kChunk(base64Data: string) {
    const outCtx = outputAudioCtxRef.current;
    if (!outCtx) return;

    const binary = atob(base64Data);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    const audioBuffer = outCtx.createBuffer(1, float32.length, 24000);
    audioBuffer.getChannelData(0).set(float32);

    const source = outCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(outCtx.destination);

    const now = outCtx.currentTime;
    const startAt = Math.max(now, nextStartTimeRef.current);
    source.start(startAt);
    nextStartTimeRef.current = startAt + audioBuffer.duration;
  }

  async function startLiveSession() {
    try {
      setLiveStatusText('Connecting to Gemini 3.8 Live...');
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/live`);
      wsRef.current = ws;

      const outCtx = new AudioContext({ sampleRate: 24000 });
      outputAudioCtxRef.current = outCtx;
      nextStartTimeRef.current = outCtx.currentTime;

      ws.onopen = async () => {
        setIsLiveConnected(true);
        setLiveStatusText('Live Voice Session Active (16kHz Mic → 24kHz Audio)');

        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          mediaStreamRef.current = stream;
          const inCtx = new AudioContext({ sampleRate: 16000 });
          inputAudioCtxRef.current = inCtx;
          const source = inCtx.createMediaStreamSource(stream);
          const processor = inCtx.createScriptProcessor(4096, 1, 1);
          source.connect(processor);
          processor.connect(inCtx.destination);

          processor.onaudioprocess = (event) => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              const inputData = event.inputBuffer.getChannelData(0);
              const base64Pcm = float32ToPcm16Base64(inputData);
              wsRef.current.send(JSON.stringify({ audio: base64Pcm }));
            }
          };
        } catch {
          setLiveStatusText(
            'Connected to Gemini 3.8 Live (Microphone unavailable — use text input below to speak to Live API)'
          );
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.audio) {
            playPcm24kChunk(msg.audio);
          }
          if (msg.outputTranscript) {
            setLiveTranscripts((prev) => [...prev, `Director AI: ${msg.outputTranscript}`]);
          }
          if (msg.inputTranscript) {
            setLiveTranscripts((prev) => [...prev, `You: ${msg.inputTranscript}`]);
          }
          if (msg.interrupted && outputAudioCtxRef.current) {
            nextStartTimeRef.current = outputAudioCtxRef.current.currentTime;
          }
          if (msg.error) {
            setLiveStatusText(`Live Error: ${msg.error}`);
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        setIsLiveConnected(false);
        setLiveStatusText('Disconnected from Gemini 3.8 Live');
      };
    } catch (err) {
      setLiveStatusText(
        `Failed to connect: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  function stopLiveSession() {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (inputAudioCtxRef.current) {
      inputAudioCtxRef.current.close().catch(() => {});
      inputAudioCtxRef.current = null;
    }
    if (outputAudioCtxRef.current) {
      outputAudioCtxRef.current.close().catch(() => {});
      outputAudioCtxRef.current = null;
    }
    setIsLiveConnected(false);
    setLiveStatusText('Session ended');
  }

  function sendLiveTextPrompt(e: React.FormEvent) {
    e.preventDefault();
    if (!liveTextPrompt.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)
      return;
    wsRef.current.send(JSON.stringify({ text: liveTextPrompt.trim() }));
    setLiveTranscripts((prev) => [...prev, `You: ${liveTextPrompt.trim()}`]);
    setLiveTextPrompt('');
  }

  function handleMediaUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMediaFileName(file.name);
    setMediaMimeType(file.type || 'image/png');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setMediaPreviewUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleAnalyzeMedia() {
    if (!mediaPreviewUrl) {
      setAnalysisError('Please upload a photo or video file first.');
      return;
    }
    setAnalysisLoading(true);
    setAnalysisError(null);
    setAnalysisResult('');
    try {
      const response = await fetch('/api/gemini/analyze-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaBase64: mediaPreviewUrl,
          mimeType: mediaMimeType,
          prompt: analysisPrompt,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze media');
      }
      setAnalysisResult(data.analysis || 'No analysis returned.');
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalysisLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Director Studio Intelligence Suite"
    >
      <div className="flex h-[640px] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-[#111622] text-slate-100 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">
              Studio Director Suite
            </h2>
            <p className="text-xs text-slate-400">
              Multi-Turn Screenplay Chat · Real-Time Voice Live API · Photo & Video Understanding
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Studio Director Suite"
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Segmented Tab Controls */}
        <div className="flex items-center gap-2 border-b border-slate-800 bg-[#0D111A] px-6 py-3">
          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === 'chat'
                ? 'bg-violet-600 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Director Chat
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('live')}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === 'live'
                ? 'bg-violet-600 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <Radio className="h-3.5 w-3.5" />
            Live Voice Room (gemini-3.8-live)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('analyze')}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === 'analyze'
                ? 'bg-violet-600 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <FileVideo className="h-3.5 w-3.5" />
            Analyze Photo & Video (Gemini 4 Argon)
          </button>
        </div>

        {/* Tab 1: Multi-Turn Gemini Chatbot */}
        {activeTab === 'chat' && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 bg-[#0E131F] px-6 py-2.5 text-xs">
              <span className="text-slate-400">Select Intelligence Engine:</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setChatModel('gemini-3.1-flash-lite')}
                  className={`rounded-md px-2.5 py-1 font-medium whitespace-nowrap transition-colors ${
                    chatModel === 'gemini-3.1-flash-lite'
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Fast (gemini-3.1-flash-lite)
                </button>
                <button
                  type="button"
                  onClick={() => setChatModel('gemini-3.8-flash')}
                  className={`rounded-md px-2.5 py-1 font-medium whitespace-nowrap transition-colors ${
                    chatModel === 'gemini-3.8-flash'
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Balanced (gemini-3.8-flash)
                </button>
                <button
                  type="button"
                  onClick={() => setChatModel('gemini-4-argon')}
                  className={`rounded-md px-2.5 py-1 font-medium whitespace-nowrap transition-colors ${
                    chatModel === 'gemini-4-argon'
                      ? 'bg-violet-600/30 text-violet-200 border border-violet-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  High Thinking (gemini-4-argon)
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-violet-600 text-white'
                        : 'border border-slate-800 bg-[#171E2E] text-slate-200'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                    {msg.role === 'model' && (
                      <div className="mt-2 flex items-center justify-between gap-4 border-t border-slate-800 pt-2 text-[11px] text-slate-400">
                        <span>Model: {msg.modelUsed || chatModel}</span>
                        <button
                          type="button"
                          onClick={() => {
                            onApplyPromptToDrama(msg.text);
                            onClose();
                          }}
                          className="font-medium text-violet-400 hover:text-violet-300"
                        >
                          Use in AI Drama Studio →
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
                  <span>Director AI is drafting response ({chatModel})...</span>
                </div>
              )}
              {chatError && (
                <div className="rounded-lg border border-red-500/30 bg-red-950/30 p-3 text-xs text-red-300">
                  {chatError}
                </div>
              )}
            </div>

            <form
              onSubmit={handleSendChat}
              className="flex items-center gap-3 border-t border-slate-800 bg-[#0D111A] px-6 py-4"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask the Showrunner to pitch a plot twist, dialogue beat, or camera shot..."
                aria-label="Chat message input"
                className="flex-1 rounded-lg border border-slate-800 bg-[#151B28] px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={chatLoading || !chatInput.trim()}
                className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                Send
              </button>
            </form>
          </div>
        )}

        {/* Tab 2: Live Voice API (gemini-3.8-live) */}
        {activeTab === 'live' && (
          <div className="flex flex-1 flex-col justify-between p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-[#161D2B] p-4">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Real-Time Voice Co-Director (gemini-3.8-live)
                  </h3>
                  <p className="mt-1 text-xs text-slate-400">{liveStatusText}</p>
                </div>
                {!isLiveConnected ? (
                  <button
                    type="button"
                    onClick={startLiveSession}
                    className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-500"
                  >
                    <Mic className="h-4 w-4" />
                    Start Live Voice Session
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopLiveSession}
                    className="flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-rose-500"
                  >
                    <MicOff className="h-4 w-4" />
                    End Live Session
                  </button>
                )}
              </div>

              <div className="h-64 overflow-y-auto rounded-xl border border-slate-800 bg-[#0D111A] p-4 text-xs text-slate-300">
                {liveTranscripts.length === 0 ? (
                  <p className="text-slate-500">
                    Start a Live Voice session to rehearse character lines and brainstorm drama scenes in real time with low-latency audio streaming.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {liveTranscripts.map((line, idx) => (
                      <p key={idx} className="leading-relaxed">
                        {line}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <form onSubmit={sendLiveTextPrompt} className="mt-4 flex items-center gap-3">
              <input
                type="text"
                value={liveTextPrompt}
                onChange={(e) => setLiveTextPrompt(e.target.value)}
                disabled={!isLiveConnected}
                placeholder={
                  isLiveConnected
                    ? 'Send a live text cue to the voice session...'
                    : 'Connect to Live session first...'
                }
                className="flex-1 rounded-lg border border-slate-800 bg-[#151B28] px-4 py-2.5 text-sm text-white placeholder-slate-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!isLiveConnected || !liveTextPrompt.trim()}
                className="rounded-lg bg-slate-800 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
              >
                Send Cue
              </button>
            </form>
          </div>
        )}

        {/* Tab 3: Analyze Photo & Video Content (gemini-4-argon) */}
        {activeTab === 'analyze' && (
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex flex-col justify-between rounded-xl border border-slate-800 bg-[#151C2A] p-4">
                <div>
                  <label
                    htmlFor="media-analyzer-upload"
                    className="block text-xs font-semibold text-slate-200"
                  >
                    Upload Reference Photo or Video Clip
                  </label>
                  <p className="mt-1 text-xs text-slate-400">
                    Uses Gemini 4 Argon (`gemini-4-argon`) with High Thinking to inspect storyboards, location photos, or dailies video clips.
                  </p>
                  <label
                    htmlFor="media-analyzer-upload"
                    className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-700 bg-[#0E131F] px-4 py-6 text-xs font-medium text-slate-300 transition-colors hover:border-violet-500 hover:text-white"
                  >
                    <Upload className="h-4 w-4 text-violet-400" />
                    <span>{mediaFileName || 'Choose Image or Video File'}</span>
                    <input
                      id="media-analyzer-upload"
                      type="file"
                      accept="image/*,video/*"
                      onChange={handleMediaUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="mt-4">
                  <label
                    htmlFor="analysis-prompt-input"
                    className="block text-xs font-medium text-slate-300"
                  >
                    Analysis Directive
                  </label>
                  <textarea
                    id="analysis-prompt-input"
                    value={analysisPrompt}
                    onChange={(e) => setAnalysisPrompt(e.target.value)}
                    rows={3}
                    className="mt-1.5 w-full rounded-lg border border-slate-800 bg-[#0E131F] p-2.5 text-xs text-white focus:border-violet-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAnalyzeMedia}
                    disabled={analysisLoading}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
                  >
                    {analysisLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Analyzing with Gemini 4 Argon...
                      </>
                    ) : (
                      'Analyze Media with Gemini 4 Argon'
                    )}
                  </button>
                </div>
              </div>

              <div className="flex flex-col rounded-xl border border-slate-800 bg-[#0D111A] p-4">
                <span className="text-xs font-semibold text-slate-300">
                  Gemini 4 Argon Scene Breakdown
                </span>
                {analysisError && (
                  <p className="mt-2 text-xs text-rose-400">{analysisError}</p>
                )}
                {analysisResult ? (
                  <div className="mt-2 flex-1 overflow-y-auto text-xs leading-relaxed whitespace-pre-wrap text-slate-200">
                    {analysisResult}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">
                    Upload an image or video and click Analyze to extract shot composition, lighting ratios, and narrative continuity notes.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
