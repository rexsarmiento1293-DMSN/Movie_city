import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer } from 'ws';
import {
  GoogleGenAI,
  LiveServerMessage,
  Modality,
  ThinkingLevel,
} from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getGenAIClient() {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // 1. AI Drama & Effects Screenplay Generation
  // Supports:
  // - High Thinking Mode: gemini-4-argon with ThinkingLevel.HIGH (no maxOutputTokens)
  // - Google Search Grounding: gemini-3.8-flash with googleSearch tool
  // - Fast Low-Latency Mode: gemini-3.1-flash-lite
  // - General Mode: gemini-3.8-flash
  app.post('/api/gemini/drama', async (req, res) => {
    try {
      const {
        prompt,
        genre = 'Romance',
        mode = 'general',
        useSearchGrounding = false,
        category = 'drama',
      } = req.body || {};

      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        res.status(400).json({ error: 'Please provide a valid prompt.' });
        return;
      }

      const ai = getGenAIClient();
      let selectedModel = 'gemini-3.8-flash';
      if (mode === 'thinking') {
        selectedModel = 'gemini-4-argon';
      } else if (mode === 'fast') {
        selectedModel = 'gemini-3.1-flash-lite';
      } else if (useSearchGrounding) {
        selectedModel = 'gemini-3.8-flash';
      }

      const systemInstruction =
        category === 'effects'
          ? `You are a Senior VFX Supervisor at Movie City AI Drama Studio. Design a detailed visual effects shot breakdown, camera motion plan, shader/particle layering guide, and lighting cues for the "${genre}" effect style.`
          : `You are an Executive Drama Showrunner at Movie City AI Drama Studio. Write a gripping, production-ready short drama scene in the "${genre}" genre. Include:
1. Title & Logline
2. Visual Cinematography & Lighting Direction
3. Character Dialogue (formatted clearly with speaker names so it can be performed with Text-to-Speech)
4. Cliffhanger Hook.`;

      const config: Record<string, unknown> = {
        systemInstruction,
      };

      if (selectedModel === 'gemini-4-argon' && mode === 'thinking') {
        config.thinkingConfig = {
          thinkingLevel: ThinkingLevel.HIGH,
        };
      }

      if (useSearchGrounding && selectedModel === 'gemini-3.8-flash') {
        config.tools = [{ googleSearch: {} }];
      }

      const response = await ai.models.generateContent({
        model: selectedModel,
        contents: prompt.trim(),
        config,
      });

      const groundingChunks =
        response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const sources = groundingChunks
        .map((chunk: { web?: { uri?: string; title?: string } }) =>
          chunk.web ? { uri: chunk.web.uri, title: chunk.web.title } : null
        )
        .filter(Boolean);

      res.json({
        model: selectedModel,
        script: response.text || '',
        sources,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  // 2. Convert Text to Speech using gemini-3.8-flash-tts
  app.post('/api/gemini/tts', async (req, res) => {
    try {
      const {
        text,
        voiceName = 'Kore',
        style = 'Cinematic, expressive drama narrator',
      } = req.body || {};

      if (!text || typeof text !== 'string' || !text.trim()) {
        res.status(400).json({ error: 'Please provide text to synthesize.' });
        return;
      }

      const ai = getGenAIClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: text.trim().slice(0, 1500),
                speechMetadata: {
                  style,
                },
              } as Record<string, unknown>,
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      });

      const base64Audio =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        res.status(500).json({ error: 'No audio data returned from gemini-3.8-flash-tts' });
        return;
      }

      res.json({
        model: 'gemini-3.8-flash-tts',
        audioDataUri: `data:audio/wav;base64,${base64Audio}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  // 3. Create & Edit Images (gemini-nano-banana-2.1) and Studio High-Quality Images (gemini-3-pro-image-preview / gemini-3-pro-image)
  // Supports aspect ratios: 1:1, 2:3, 3:2, 3:4, 4:3, 9:16, 16:9, 21:9 and imageSize: 1K, 2K, 4K
  app.post('/api/gemini/image', async (req, res) => {
    try {
      const {
        prompt,
        style = 'Photorealistic',
        aspectRatio = '16:9',
        imageSize = '1K',
        modelChoice = 'gemini-nano-banana-2.1',
        sourceImageBase64,
        sourceImageMimeType = 'image/png',
      } = req.body || {};

      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        res.status(400).json({ error: 'Please provide an image description.' });
        return;
      }

      const ai = getGenAIClient();
      // Honor both gemini-nano-banana-2.1 and gemini-3-pro-image-preview / gemini-3-pro-image
      const model =
        modelChoice === 'gemini-3-pro-image-preview' || modelChoice === 'gemini-3-pro-image'
          ? modelChoice
          : 'gemini-nano-banana-2.1';

      const parts: Record<string, unknown>[] = [];
      if (sourceImageBase64 && typeof sourceImageBase64 === 'string') {
        const cleanBase64 = sourceImageBase64.replace(/^data:[^;]+;base64,/, '');
        parts.push({
          inlineData: {
            data: cleanBase64,
            mimeType: sourceImageMimeType,
          },
        });
      }
      parts.push({
        text: `${prompt.trim()} — Style: ${style}, cinematic studio lighting, aspect ratio ${aspectRatio}.`,
      });

      const response = await ai.models.generateContent({
        model,
        contents: { parts },
        config: {
          imageConfig: {
            aspectRatio,
            imageSize,
          },
        },
      });

      let imageUrl = '';
      let captionText = '';
      const candidateParts = response.candidates?.[0]?.content?.parts || [];
      for (const part of candidateParts) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType || 'image/png';
          imageUrl = `data:${mime};base64,${part.inlineData.data}`;
        } else if (part.text) {
          captionText += part.text;
        }
      }

      if (!imageUrl) {
        res.status(500).json({ error: 'No image was generated by the model.' });
        return;
      }

      res.json({
        model,
        imageUrl,
        captionText,
        aspectRatio,
        imageSize,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  // 4. Generate Video from Text & Animate Uploaded Image into Video
  // Uses gemini-omni-1.1-flash via the Interactions API (ai.interactions.create) with aspect_ratio '16:9' or '9:16'
  app.post('/api/gemini/video', async (req, res) => {
    try {
      const {
        prompt,
        style = 'Cinematic',
        aspectRatio = '16:9',
        duration = '5s',
        sourceImageBase64,
        sourceImageMimeType = 'image/png',
      } = req.body || {};

      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        res.status(400).json({ error: 'Please describe your video scene or motion.' });
        return;
      }

      const validAspectRatio = aspectRatio === '9:16' ? '9:16' : '16:9';
      const ai = getGenAIClient();

      const fullPrompt = `${prompt.trim()} (${style} style, smooth camera movement)`;
      const inputPayload =
        sourceImageBase64 && typeof sourceImageBase64 === 'string'
          ? [
              {
                type: 'image' as const,
                mime_type: sourceImageMimeType,
                data: sourceImageBase64.replace(/^data:[^;]+;base64,/, ''),
              },
              {
                type: 'text' as const,
                text: fullPrompt,
              },
            ]
          : fullPrompt;

      const interaction = await ai.interactions.create(
        {
          model: 'gemini-omni-1.1-flash',
          input: inputPayload,
          background: false,
          store: false,
          stream: false,
          response_format: {
            type: 'video',
            aspect_ratio: validAspectRatio,
            duration: duration === '10s' ? '10s' : '5s',
            resolution: '720p',
          },
        },
        { timeout: 300000 }
      );

      const videoPart = interaction.output_video;
      if (videoPart?.data) {
        const mime = videoPart.mime_type || 'video/mp4';
        res.json({
          model: 'gemini-omni-1.1-flash',
          videoUrl: `data:${mime};base64,${videoPart.data}`,
          aspectRatio: validAspectRatio,
        });
        return;
      }
      if (videoPart?.uri) {
        res.json({
          model: 'gemini-omni-1.1-flash',
          videoUrl: videoPart.uri,
          aspectRatio: validAspectRatio,
        });
        return;
      }

      res.status(500).json({ error: 'Video generation completed without video payload.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  // 5. Generate Music using lyria-3-clip-preview (30s clip) or lyria-3-pro-preview (full track)
  app.post('/api/gemini/music', async (req, res) => {
    try {
      const {
        prompt,
        durationType = 'clip',
        sourceImageBase64,
        sourceImageMimeType = 'image/jpeg',
      } = req.body || {};

      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        res.status(400).json({ error: 'Please describe the soundtrack you want to generate.' });
        return;
      }

      const model =
        durationType === 'pro' ? 'lyria-3-pro-preview' : 'lyria-3-clip-preview';
      const ai = getGenAIClient();

      const contents =
        sourceImageBase64 && typeof sourceImageBase64 === 'string'
          ? {
              parts: [
                { text: prompt.trim() },
                {
                  inlineData: {
                    data: sourceImageBase64.replace(/^data:[^;]+;base64,/, ''),
                    mimeType: sourceImageMimeType,
                  },
                },
              ],
            }
          : prompt.trim();

      const responseStream = await ai.models.generateContentStream({
        model,
        contents,
        config: {
          responseModalities: [Modality.AUDIO],
        },
      });

      let audioBase64 = '';
      let lyrics = '';
      let mimeType = 'audio/wav';

      for await (const chunk of responseStream) {
        const parts = chunk.candidates?.[0]?.content?.parts;
        if (!parts) continue;
        for (const part of parts) {
          if (part.inlineData?.data) {
            if (!audioBase64 && part.inlineData.mimeType) {
              mimeType = part.inlineData.mimeType;
            }
            audioBase64 += part.inlineData.data;
          }
          if (part.text && !lyrics) {
            lyrics = part.text;
          }
        }
      }

      if (!audioBase64) {
        res.status(500).json({ error: 'No audio stream returned from Lyria model.' });
        return;
      }

      res.json({
        model,
        audioDataUri: `data:${mimeType};base64,${audioBase64}`,
        lyrics,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  // 6. Analyze Uploaded Images & Videos using gemini-4-argon
  app.post('/api/gemini/analyze-media', async (req, res) => {
    try {
      const {
        mediaBase64,
        mimeType = 'image/png',
        prompt = 'Analyze this media for cinematic composition, lighting, mood, key narrative beats, and continuity.',
      } = req.body || {};

      if (!mediaBase64 || typeof mediaBase64 !== 'string') {
        res.status(400).json({ error: 'Please upload an image or video file to analyze.' });
        return;
      }

      const ai = getGenAIClient();
      const cleanBase64 = mediaBase64.replace(/^data:[^;]+;base64,/, '');

      const response = await ai.models.generateContent({
        model: 'gemini-4-argon',
        contents: {
          parts: [
            {
              inlineData: {
                data: cleanBase64,
                mimeType,
              },
            },
            {
              text: prompt,
            },
          ],
        },
        config: {
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.HIGH,
          },
        },
      });

      res.json({
        model: 'gemini-4-argon',
        analysis: response.text || '',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  // 7. Transcribe Audio using gemini-3.5-transcribe
  app.post('/api/gemini/transcribe', async (req, res) => {
    try {
      const { audioBase64, mimeType = 'audio/webm' } = req.body || {};

      if (!audioBase64 || typeof audioBase64 !== 'string') {
        res.status(400).json({ error: 'No audio data provided for transcription.' });
        return;
      }

      const ai = getGenAIClient();
      const cleanBase64 = audioBase64.replace(/^data:[^;]+;base64,/, '');

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: cleanBase64,
              },
            },
            {
              text: 'Transcribe this audio accurately for a drama screenplay.',
            },
          ],
        },
      });

      res.json({
        model: 'gemini-3.5-transcribe',
        transcript: response.text || '',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  // 8. Multi-Turn Director Chatbot (gemini-4-argon, gemini-3.8-flash, gemini-3.1-flash-lite)
  app.post('/api/gemini/chat', async (req, res) => {
    try {
      const {
        messages = [],
        model = 'gemini-3.8-flash',
        enableHighThinking = false,
      } = req.body || {};

      if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: 'Messages array is required.' });
        return;
      }

      const selectedModel =
        model === 'gemini-4-argon' || enableHighThinking
          ? 'gemini-4-argon'
          : model === 'gemini-3.1-flash-lite'
          ? 'gemini-3.1-flash-lite'
          : 'gemini-3.8-flash';

      const ai = getGenAIClient();
      const history = messages.slice(0, -1).map((m: { role: string; text: string }) => ({
        role: m.role === 'model' ? 'model' : 'user',
        parts: [{ text: String(m.text || '') }],
      }));
      const latestMessage = String(messages[messages.length - 1]?.text || '');

      const config: Record<string, unknown> = {
        systemInstruction:
          'You are the Executive AI Showrunner & Film Director at Movie City — AI Drama Studio. Help the user develop episodic drama arcs, screenplay dialogue, camera blocking, lighting setups, and soundtrack direction with concise, actionable studio craft.',
      };

      if (selectedModel === 'gemini-4-argon') {
        config.thinkingConfig = {
          thinkingLevel: ThinkingLevel.HIGH,
        };
      }

      const chat = ai.chats.create({
        model: selectedModel,
        history,
        config,
      });

      const response = await chat.sendMessage({
        message: latestMessage,
      });

      res.json({
        model: selectedModel,
        reply: response.text || '',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  // 9. Live API Real-Time Voice Conversation WebSocket (/live) using gemini-3.8-live
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    if (request.url?.startsWith('/live')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', async (clientWs) => {
    let liveSession: Awaited<ReturnType<GoogleGenAI['live']['connect']>> | null = null;
    try {
      const ai = getGenAIClient();
      const sessionPromise = ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          systemInstruction:
            'You are the Live Voice Co-Director inside Movie City AI Drama Studio. Pitch dramatic plot twists, rehearse character lines, and brainstorm scenes in real time.',
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            const audio =
              message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audio && clientWs.readyState === clientWs.OPEN) {
              clientWs.send(JSON.stringify({ audio }));
            }
            if (
              message.serverContent?.outputTranscription?.text &&
              clientWs.readyState === clientWs.OPEN
            ) {
              clientWs.send(
                JSON.stringify({
                  outputTranscript: message.serverContent.outputTranscription.text,
                })
              );
            }
            if (
              message.serverContent?.inputTranscription?.text &&
              clientWs.readyState === clientWs.OPEN
            ) {
              clientWs.send(
                JSON.stringify({
                  inputTranscript: message.serverContent.inputTranscription.text,
                })
              );
            }
            if (
              message.serverContent?.interrupted &&
              clientWs.readyState === clientWs.OPEN
            ) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
          },
          onerror: (err: unknown) => {
            if (clientWs.readyState === clientWs.OPEN) {
              clientWs.send(
                JSON.stringify({
                  error: err instanceof Error ? err.message : 'Live session error',
                })
              );
            }
          },
        },
      });

      liveSession = await sessionPromise;

      clientWs.on('message', (raw) => {
        try {
          const parsed = JSON.parse(raw.toString());
          if (parsed.audio) {
            sessionPromise.then((session) => {
              session.sendRealtimeInput({
                audio: { data: parsed.audio, mimeType: 'audio/pcm;rate=16000' },
              });
            });
          } else if (parsed.text) {
            sessionPromise.then((session) => {
              session.sendRealtimeInput({
                text: String(parsed.text),
              });
            });
          }
        } catch {
          // Ignore malformed frame
        }
      });

      clientWs.on('close', () => {
        if (liveSession) {
          try {
            liveSession.close();
          } catch {
            // ignore
          }
        }
      });
    } catch (error) {
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(
          JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          })
        );
      }
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Movie City — AI Drama Studio server running on http://localhost:${PORT}`);
  });
}

startServer();
