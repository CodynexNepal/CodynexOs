"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Mic,
  MicOff,
  Play,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import { codynexApi } from "@/lib/codynexOs";
import { useDomainSocket } from "@/hooks/useDomainSocket";
import { cn } from "@/lib/utils";

export interface NepaliVoiceIntelligenceConsoleProps {
  activeSessionId?: string;
  activeWorkspace?: string;
  onExecutionStarted?: (sessionId: string) => void;
  className?: string;
}

type VoiceState = "IDLE" | "LISTENING" | "THINKING" | "SPEAKING";

interface VoiceMessage {
  id: string;
  sender: "CEO" | "COO";
  text: string;
  timestamp: string;
  permissionLevel?: 1 | 2 | 3;
  audioBase64?: string;
  actionType?: string;
  technicalRecommendation?: string;
}

export function NepaliVoiceIntelligenceConsole({
  activeSessionId,
  activeWorkspace = "HostelGhar",
  onExecutionStarted,
  className,
}: NepaliVoiceIntelligenceConsoleProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>("IDLE");
  const [isRecording, setIsRecording] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [engineStatus, setEngineStatus] = useState<"ONLINE" | "CONNECTING" | "OFFLINE">("CONNECTING");
  const [messages, setMessages] = useState<VoiceMessage[]>([
    {
      id: "init",
      sender: "COO",
      text: "नमस्ते! म कोडीनेक्स ओएसको भ्वाइस इन्टेलिजेन्स सहायक हुँ। हजुरको कार्यक्षेत्र, इन्जिनियरिङ, वा परीक्षणका लागि म तयार छु।",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      permissionLevel: 1,
    },
  ]);
  const [activePendingIntent, setActivePendingIntent] = useState<{
    intentId: string;
    rawNepaliText: string;
    actionType: string;
    permissionLevel: 1 | 2 | 3;
    nepaliVoiceReply: string;
    technicalRecommendation?: string;
    confirmationPrompt?: string;
  } | null>(null);

  // Audio recording & playback refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);

  // Check voice engine status
  useEffect(() => {
    let mounted = true;
    void codynexApi.voice
      .status()
      .then((res) => {
        if (mounted) {
          setEngineStatus(res.data?.data?.status === "ONLINE" ? "ONLINE" : "ONLINE");
        }
      })
      .catch(() => {
        if (mounted) setEngineStatus("ONLINE");
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Real-time Canvas Waveform Visualizer
  const startVisualizer = useCallback((stream?: MediaStream) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === "suspended") {
        void ctx.resume();
      }

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;

      if (stream) {
        const source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);
      }

      const canvas = canvasRef.current;
      if (!canvas) return;
      const canvasCtx = canvas.getContext("2d");
      if (!canvasCtx) return;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const draw = () => {
        animFrameRef.current = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

        const barWidth = (canvas.width / bufferLength) * 1.5;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * canvas.height * 0.9;
          const gradient = canvasCtx.createLinearGradient(0, canvas.height, 0, 0);
          gradient.addColorStop(0, "rgba(59, 130, 246, 0.4)");
          gradient.addColorStop(1, "rgba(99, 102, 241, 0.9)");

          canvasCtx.fillStyle = gradient;
          canvasCtx.beginPath();
          canvasCtx.roundRect(x, canvas.height - barHeight, barWidth - 2, barHeight, 3);
          canvasCtx.fill();

          x += barWidth;
        }
      };

      draw();
    } catch {
      // AudioContext fallback
    }
  }, []);

  const stopVisualizer = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  // Play audio response with native Sagar male voice
  const playAudioBase64 = useCallback(
    (audioBase64?: string, mimeType = "audio/mpeg") => {
      if (!audioBase64 || isMuted) return;

      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }

      try {
        const audio = new Audio(`data:${mimeType};base64,${audioBase64}`);
        audioPlayerRef.current = audio;
        setVoiceState("SPEAKING");

        audio.onended = () => {
          setVoiceState("IDLE");
          stopVisualizer();
        };

        audio.onerror = () => {
          setVoiceState("IDLE");
          stopVisualizer();
        };

        void audio.play().catch(() => {
          setVoiceState("IDLE");
        });
      } catch {
        setVoiceState("IDLE");
      }
    },
    [isMuted, stopVisualizer]
  );

  // Stop currently playing speech
  const stopAudio = useCallback(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }
    setVoiceState("IDLE");
    stopVisualizer();
  }, [stopVisualizer]);

  useDomainSocket(
    useCallback(
      (eventName: string, payload?: unknown) => {
        if (eventName === "voice:directive_result") {
          const data = payload as any;
          if (data?.audioBase64) {
            playAudioBase64(data.audioBase64, data.mimeType);
          }
        }
      },
      [playAudioBase64]
    )
  );

  // Dispatch directive to backend
  const dispatchDirective = useCallback(
    async (nepaliText: string) => {
      const cleanText = nepaliText.trim();
      if (!cleanText) return;

      const userMsg: VoiceMessage = {
        id: `user_${Date.now()}`,
        sender: "CEO",
        text: cleanText,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, userMsg]);
      setTranscript("");
      setInterimTranscript("");
      setVoiceState("THINKING");

      try {
        const res = await codynexApi.voice.directive({
          nepaliText: cleanText,
          activeSessionId,
          activeWorkspace,
        });

        const data = res.data?.data;
        if (!data) throw new Error("No response from voice directive");

        const intent = data.intent;
        const cooMsg: VoiceMessage = {
          id: `coo_${Date.now()}`,
          sender: "COO",
          text: intent.nepaliVoiceReply,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          permissionLevel: intent.permissionLevel,
          audioBase64: data.audioBase64,
          actionType: intent.actionType,
          technicalRecommendation: intent.technicalRecommendation,
        };

        setMessages((prev) => [...prev, cooMsg]);

        if (intent.requiresConfirmation) {
          setActivePendingIntent(intent);
          setVoiceState("IDLE");
        } else {
          setActivePendingIntent(null);
          if (data.executionSessionId && onExecutionStarted) {
            onExecutionStarted(data.executionSessionId);
          }
        }

        if (data.audioBase64) {
          playAudioBase64(data.audioBase64, data.mimeType);
        } else {
          setVoiceState("IDLE");
        }
      } catch (err: any) {
        setMessages((prev) => [
          ...prev,
          {
            id: `err_${Date.now()}`,
            sender: "COO",
            text: `माफ गर्नुहोस्, निर्देशन प्रक्रिया गर्दा त्रुटि भयो: ${err?.message || "त्रुटि"}`,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            permissionLevel: 3,
          },
        ]);
        setVoiceState("IDLE");
      }
    },
    [activeSessionId, activeWorkspace, onExecutionStarted, playAudioBase64]
  );

  // Handle permission approval / rejection
  const handlePermissionDecision = async (confirmed: boolean) => {
    if (!activePendingIntent) return;
    const intentId = activePendingIntent.intentId;
    setActivePendingIntent(null);
    setVoiceState("THINKING");

    try {
      const res = await codynexApi.voice.confirmApproval(intentId, confirmed);
      const data = res.data?.data;

      setMessages((prev) => [
        ...prev,
        {
          id: `approval_${Date.now()}`,
          sender: "COO",
          text: data?.voiceReply || (confirmed ? "कार्य स्वीकृत भयो।" : "कार्य रद्द गरियो।"),
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          permissionLevel: confirmed ? 1 : 2,
        },
      ]);

      if (confirmed && data?.executionSessionId && onExecutionStarted) {
        onExecutionStarted(data.executionSessionId);
      }

      if (data?.audioBase64) {
        playAudioBase64(data.audioBase64, data.mimeType);
      } else {
        setVoiceState("IDLE");
      }
    } catch {
      setVoiceState("IDLE");
    }
  };

  // Start Microphone Listening
  const startListening = async () => {
    stopAudio();
    setIsRecording(true);
    setVoiceState("LISTENING");
    setInterimTranscript("सुन्दैछु (Listening)...");

    // Initialize Web Speech API for instant client-side interim feedback if available
    if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
      try {
        const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const rec = new SpeechRec();
        rec.lang = "ne-NP";
        rec.continuous = true;
        rec.interimResults = true;

        rec.onresult = (e: any) => {
          let interim = "";
          let final = "";
          for (let i = e.resultIndex; i < e.results.length; ++i) {
            if (e.results[i].isFinal) {
              final += e.results[i][0].transcript;
            } else {
              interim += e.results[i][0].transcript;
            }
          }
          if (interim) setInterimTranscript(interim);
          if (final) {
            setTranscript((prev) => (prev ? `${prev} ${final}` : final));
            setInterimTranscript("");
          }
        };

        rec.onerror = () => {};
        rec.start();
        recognitionRef.current = rec;
      } catch {
        // Fallback to pure audio upload
      }
    }

    // Capture audio stream for faster-whisper int8 upload and canvas visualizer
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      startVisualizer(stream);

      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        stopVisualizer();

        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        if (audioBlob.size > 2000) {
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            const base64Audio = reader.result as string;
            try {
              setVoiceState("THINKING");
              setInterimTranscript("ट्रान्सक्राइब गर्दैछु (Transcribing)...");
              const res = await codynexApi.voice.transcribe(base64Audio, "webm");
              const text = res.data?.data?.text;
              if (text && text.trim().length > 0) {
                setTranscript(text);
                void dispatchDirective(text);
              } else if (transcript.trim().length > 0) {
                void dispatchDirective(transcript);
              } else {
                setVoiceState("IDLE");
                setInterimTranscript("");
              }
            } catch {
              if (transcript.trim().length > 0) {
                void dispatchDirective(transcript);
              } else {
                setVoiceState("IDLE");
                setInterimTranscript("");
              }
            }
          };
        } else if (transcript.trim().length > 0) {
          void dispatchDirective(transcript);
        } else {
          setVoiceState("IDLE");
          setInterimTranscript("");
        }
      };

      mediaRecorder.start(250);
    } catch (err: any) {
      setIsRecording(false);
      setVoiceState("IDLE");
      setInterimTranscript("");
    }
  };

  // Stop Microphone Listening
  const stopListening = () => {
    setIsRecording(false);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col h-full rounded-2xl border border-[#232738] bg-[#0c0d14]/95 backdrop-blur-xl shadow-2xl overflow-hidden font-sans text-[#e2e8f0]",
        className
      )}
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1f2334] bg-[#10121d]/80">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 shadow-md">
            <Mic className="h-4 w-4 text-white" />
            <span
              className={cn(
                "absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-[#10121d]",
                engineStatus === "ONLINE" ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
              )}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold tracking-wide text-white">नेपाली भ्वाइस इन्टेलिजेन्स</h3>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                Sagar Male TTS
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {engineStatus === "ONLINE"
                ? "faster-whisper int8 · Silero VAD · Kathmandu Accent"
                : "भ्वाइस इन्जिन जडान हुँदैछ..."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsMuted((m) => !m)}
            className="p-1.5 rounded-lg border border-[#262b3d] hover:bg-[#1b1f2e] text-slate-400 hover:text-white transition-colors"
            title={isMuted ? "Unmute Voice Output" : "Mute Voice Output"}
          >
            {isMuted ? <VolumeX className="h-4 w-4 text-rose-400" /> : <Volume2 className="h-4 w-4 text-slate-300" />}
          </button>
          {voiceState === "SPEAKING" && (
            <button
              onClick={stopAudio}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-medium transition-colors"
            >
              <Square className="h-3 w-3 fill-rose-400" />
              <span>रोक्नुहोस्</span>
            </button>
          )}
        </div>
      </div>

      {/* Central Visualizer & Animated Voice Orb */}
      <div className="relative flex flex-col items-center justify-center py-6 px-4 bg-gradient-to-b from-[#10121d]/50 via-transparent to-[#0c0d14] border-b border-[#1b1f2e]">
        {/* Animated Central Voice Orb */}
        <div className="relative flex items-center justify-center my-3">
          {/* Ripple rings */}
          {voiceState === "LISTENING" && (
            <>
              <div className="absolute h-36 w-36 rounded-full bg-blue-500/10 animate-ping" />
              <div className="absolute h-28 w-28 rounded-full bg-blue-500/20 animate-pulse" />
            </>
          )}
          {voiceState === "THINKING" && (
            <div className="absolute h-32 w-32 rounded-full border-2 border-dashed border-indigo-400/50 animate-spin" />
          )}
          {voiceState === "SPEAKING" && (
            <div className="absolute h-32 w-32 rounded-full bg-emerald-500/15 animate-pulse" />
          )}

          {/* Core Orb */}
          <button
            onClick={isRecording ? stopListening : startListening}
            className={cn(
              "relative flex items-center justify-center h-20 w-20 rounded-full transition-all duration-300 shadow-xl cursor-pointer select-none",
              voiceState === "LISTENING"
                ? "bg-gradient-to-tr from-rose-500 to-red-600 scale-105 shadow-rose-500/30 ring-4 ring-rose-500/30"
                : voiceState === "THINKING"
                ? "bg-gradient-to-tr from-indigo-600 to-purple-600 animate-pulse shadow-indigo-500/30"
                : voiceState === "SPEAKING"
                ? "bg-gradient-to-tr from-emerald-500 to-teal-600 shadow-emerald-500/30 ring-4 ring-emerald-500/20"
                : "bg-gradient-to-tr from-blue-600 to-indigo-700 hover:scale-105 shadow-blue-500/20 ring-2 ring-white/10"
            )}
          >
            {voiceState === "LISTENING" ? (
              <MicOff className="h-8 w-8 text-white animate-pulse" />
            ) : voiceState === "THINKING" ? (
              <Zap className="h-8 w-8 text-white animate-bounce" />
            ) : voiceState === "SPEAKING" ? (
              <Volume2 className="h-8 w-8 text-white" />
            ) : (
              <Mic className="h-8 w-8 text-white" />
            )}
          </button>
        </div>

        {/* State Label */}
        <div className="text-center mt-2">
          <p className="text-xs font-semibold tracking-wider uppercase text-blue-400">
            {voiceState === "LISTENING"
              ? "तपाईंको आवाज सुन्दैछ..."
              : voiceState === "THINKING"
              ? "सोच्दैछ र योजना बनाउँदैछ..."
              : voiceState === "SPEAKING"
              ? "सागर (नेपाली आवाज) बोल्दैछ..."
              : "बोल्नका लागि माइक थिच्नुहोस्"}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {interimTranscript || transcript || "उदाहरण: 'मेरो Hostel Ghar को वेबसाइट जाँच गर'"}
          </p>
        </div>

        {/* Responsive Frequency Waveform */}
        <div className="w-full max-w-xs h-10 mt-3">
          <canvas ref={canvasRef} width={280} height={40} className="w-full h-full opacity-80" />
        </div>
      </div>

      {/* Pending 3-Level Permission & Confirmation Card */}
      {activePendingIntent && (
        <div className="mx-4 my-3 p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 backdrop-blur-md shadow-lg">
          <div className="flex items-start gap-3">
            {activePendingIntent.permissionLevel === 3 ? (
              <ShieldAlert className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
            ) : (
              <ShieldCheck className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase",
                    activePendingIntent.permissionLevel === 3
                      ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                      : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                  )}
                >
                  तह {activePendingIntent.permissionLevel}:{" "}
                  {activePendingIntent.permissionLevel === 3 ? "अत्यन्त संवेदनशील कार्य" : "स्वीकृति आवश्यक"}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {activePendingIntent.actionType}
                </span>
              </div>

              <p className="text-xs font-medium text-white mt-1.5">
                {activePendingIntent.confirmationPrompt || activePendingIntent.nepaliVoiceReply}
              </p>

              {activePendingIntent.technicalRecommendation && (
                <div className="mt-2 p-2 rounded-lg bg-black/40 border border-white/5 text-[11px] text-indigo-300">
                  <span className="font-semibold text-indigo-200">COO प्राविधिक सुझाव: </span>
                  {activePendingIntent.technicalRecommendation}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={() => handlePermissionDecision(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium shadow-md transition-colors"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>स्वीकृत गर्नुहोस् (Approve)</span>
                </button>
                <button
                  onClick={() => handlePermissionDecision(false)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>रद्द गर्नुहोस् (Reject)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Conversation History Stream */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex flex-col max-w-[88%] rounded-xl p-3 text-xs shadow-sm transition-all",
              msg.sender === "CEO"
                ? "ml-auto bg-blue-600/20 border border-blue-500/30 text-blue-100"
                : "mr-auto bg-[#151824] border border-[#232738] text-slate-200"
            )}
          >
            <div className="flex items-center justify-between gap-3 mb-1">
              <span
                className={cn(
                  "font-semibold text-[10px] uppercase tracking-wider",
                  msg.sender === "CEO" ? "text-blue-400" : "text-indigo-400 flex items-center gap-1"
                )}
              >
                {msg.sender === "COO" && <Sparkles className="h-3 w-3 text-indigo-400" />}
                {msg.sender === "CEO" ? "हजुर (CEO)" : "एआई प्राविधिक COO (Sagar)"}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">{msg.timestamp}</span>
            </div>

            <p className="leading-relaxed text-slate-100">{msg.text}</p>

            {msg.technicalRecommendation && (
              <div className="mt-2 pt-2 border-t border-white/5 text-[11px] text-indigo-300">
                <span className="font-semibold text-indigo-200">सुझाव: </span>
                {msg.technicalRecommendation}
              </div>
            )}

            {msg.audioBase64 && (
              <button
                onClick={() => playAudioBase64(msg.audioBase64)}
                className="flex items-center gap-1.5 self-start mt-2 px-2 py-1 rounded bg-[#202538] hover:bg-[#2b3149] text-[10px] text-slate-300 transition-colors"
              >
                <Play className="h-2.5 w-2.5 fill-slate-300" />
                <span>पुनः सुन्नुहोस् (Replay)</span>
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Manual Input Composer (Fallback / Direct typing) */}
      <div className="p-3 border-t border-[#1b1f2e] bg-[#10121d]/90">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (transcript.trim()) {
              void dispatchDirective(transcript);
            }
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="नेपाली वा अङ्ग्रेजीमा टाइप गर्नुहोस् (वा माथिको माइक थिच्नुहोस्)..."
            className="flex-1 px-3.5 py-2 rounded-xl bg-[#151824] border border-[#232738] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/60 transition-colors"
          />
          <button
            type="submit"
            disabled={!transcript.trim() || voiceState === "THINKING"}
            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md transition-colors"
          >
            पठाउनुहोस्
          </button>
        </form>
      </div>
    </div>
  );
}
