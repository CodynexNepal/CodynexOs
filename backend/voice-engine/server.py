"""
CodyNex OS: Nepali Voice Intelligence Engine
FastAPI Microservice for int8-quantized faster-whisper STT & Native Sagar Male TTS
"""

import io
import os
import time
import base64
import asyncio
from typing import Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel
import edge_tts

try:
    from faster_whisper import WhisperModel
    FASTER_WHISPER_AVAILABLE = True
except ImportError:
    FASTER_WHISPER_AVAILABLE = False

app = FastAPI(title="CodyNex Nepali Voice Intelligence Engine", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model cache to avoid reloads
WHISPER_MODEL: Optional["WhisperModel"] = None
DEFAULT_VOICE = "ne-NP-SagarNeural"  # Deep, mature, native Kathmandu Nepali male voice

def get_whisper_model() -> "WhisperModel":
    global WHISPER_MODEL
    if WHISPER_MODEL is None and FASTER_WHISPER_AVAILABLE:
        # Load lightweight int8 model on CPU for ultra-fast, low-memory inference
        # "tiny" or "base" provides sub-300ms latency on CPU while maintaining strong Devanagari recognition
        model_size = os.getenv("WHISPER_MODEL_SIZE", "base")
        WHISPER_MODEL = WhisperModel(model_size, device="cpu", compute_type="int8", cpu_threads=4)
    return WHISPER_MODEL

class SynthesizeRequest(BaseModel):
    text: str
    voice: Optional[str] = DEFAULT_VOICE
    rate: Optional[str] = "+0%"
    pitch: Optional[str] = "+0Hz"

@app.get("/health")
def health_check():
    return {
        "status": "HEALTHY",
        "service": "CodyNex Nepali Voice Engine",
        "stt_engine": "faster-whisper int8" if FASTER_WHISPER_AVAILABLE else "fallback",
        "tts_default_voice": DEFAULT_VOICE,
        "language": "ne-NP (Nepali)",
        "timestamp": time.time(),
    }

@app.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    language: Optional[str] = Form("ne"),
    beam_size: Optional[int] = Form(3),
):
    """
    Transcribes uploaded audio (wav, webm, mp3, ogg) to Nepali Devanagari text.
    Handles Nepali-English code-switching and technical terms.
    """
    if not FASTER_WHISPER_AVAILABLE:
        raise HTTPException(status_code=500, detail="faster-whisper engine is not installed")

    t0 = time.time()
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty audio payload")

    audio_buffer = io.BytesIO(contents)

    try:
        model = get_whisper_model()
        # Use Silero VAD filter to automatically remove silence and background noise
        segments, info = model.transcribe(
            audio_buffer,
            language=language if language and language != "auto" else None,
            beam_size=beam_size or 3,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=400),
        )

        transcript_parts = []
        for segment in segments:
            transcript_parts.append(segment.text.strip())

        full_text = " ".join(transcript_parts).strip()
        latency_ms = round((time.time() - t0) * 1000)

        return {
            "success": True,
            "text": full_text,
            "detected_language": info.language,
            "language_probability": round(info.language_probability, 3),
            "duration": round(info.duration, 2),
            "latencyMs": latency_ms,
        }
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e), "latencyMs": round((time.time() - t0) * 1000)},
        )

class TranscribeBase64Request(BaseModel):
    audioBase64: str
    format: Optional[str] = "webm"
    language: Optional[str] = "ne"
    beam_size: Optional[int] = 3

@app.post("/transcribe/base64")
async def transcribe_audio_base64(req: TranscribeBase64Request):
    """
    Transcribes base64-encoded audio directly for ultra-low latency WebSocket transmission.
    """
    if not FASTER_WHISPER_AVAILABLE:
        raise HTTPException(status_code=500, detail="faster-whisper engine is not installed")

    t0 = time.time()
    try:
        raw_b64 = req.audioBase64
        if "," in raw_b64:
            raw_b64 = raw_b64.split(",", 1)[1]
        audio_bytes = base64.b64decode(raw_b64)
        if not audio_bytes:
            raise HTTPException(status_code=400, detail="Empty decoded audio")

        audio_buffer = io.BytesIO(audio_bytes)
        model = get_whisper_model()
        segments, info = model.transcribe(
            audio_buffer,
            language=req.language if req.language and req.language != "auto" else None,
            beam_size=req.beam_size or 3,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=400),
        )

        transcript_parts = []
        for segment in segments:
            transcript_parts.append(segment.text.strip())

        full_text = " ".join(transcript_parts).strip()
        latency_ms = round((time.time() - t0) * 1000)

        return {
            "success": True,
            "text": full_text,
            "detected_language": info.language,
            "language_probability": round(info.language_probability, 3),
            "duration": round(info.duration, 2),
            "latencyMs": latency_ms,
        }
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e), "latencyMs": round((time.time() - t0) * 1000)},
        )

@app.post("/synthesize")
async def synthesize_speech(req: SynthesizeRequest):
    """
    Generates native Kathmandu Nepali male speech (ne-NP-SagarNeural).
    Returns audio/mpeg stream directly.
    """
    text = (req.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    voice = req.voice or DEFAULT_VOICE
    rate = req.rate or "+0%"
    pitch = req.pitch or "+0Hz"

    try:
        communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
        audio_stream = io.BytesIO()

        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_stream.write(chunk["data"])

        audio_bytes = audio_stream.getvalue()
        return Response(content=audio_bytes, media_type="audio/mpeg")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS synthesis failed: {str(e)}")

@app.post("/synthesize/base64")
async def synthesize_speech_base64(req: SynthesizeRequest):
    """
    Generates speech and returns base64 string for zero-disk-I/O WebSocket streaming.
    """
    text = (req.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    t0 = time.time()
    voice = req.voice or DEFAULT_VOICE
    rate = req.rate or "+0%"
    pitch = req.pitch or "+0Hz"

    try:
        communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
        audio_stream = io.BytesIO()

        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_stream.write(chunk["data"])

        audio_bytes = audio_stream.getvalue()
        b64_audio = base64.b64encode(audio_bytes).decode("utf-8")
        latency_ms = round((time.time() - t0) * 1000)

        return {
            "success": True,
            "audioBase64": b64_audio,
            "mimeType": "audio/mpeg",
            "voice": voice,
            "text": text,
            "sizeBytes": len(audio_bytes),
            "latencyMs": latency_ms,
        }
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e), "latencyMs": round((time.time() - t0) * 1000)},
        )

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("VOICE_PORT", 5050))
    print(f"Starting CodyNex Nepali Voice Engine on http://127.0.0.1:{port}...")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
