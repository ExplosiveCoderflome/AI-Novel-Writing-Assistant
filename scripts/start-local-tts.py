import os
import sys
import subprocess
import urllib.request

# Reconfigure stdout/stderr to UTF-8 to support Windows console output of Chinese characters
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

# Paths for Kokoro model
CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".cache", "kokoro")
model_path = os.path.join(CACHE_DIR, "kokoro-v1.0.onnx")
voices_path = os.path.join(CACHE_DIR, "voices-v1.0.bin")

def download_file(url, dest):
    print(f"[Local TTS] Downloading {url} -> {dest} ...")
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"})
    try:
        with urllib.request.urlopen(req) as response, open(dest, 'wb') as out_file:
            total_size = int(response.info().get('Content-Length', 0))
            block_size = 1024 * 1024  # 1MB chunks
            count = 0
            while True:
                chunk = response.read(block_size)
                if not chunk:
                    break
                out_file.write(chunk)
                count += 1
                if total_size > 0:
                    percent = min(100, int(count * block_size * 100 / total_size))
                    sys.stdout.write(f"\rProgress: {percent}% ({min(total_size, count * block_size) // 1024 // 1024}MB / {total_size // 1024 // 1024}MB)")
                    sys.stdout.flush()
        print("\n[Local TTS] Download complete!")
    except Exception as e:
        print(f"\n[Local TTS] Download failed: {e}")
        if os.path.exists(dest):
            try:
                os.remove(dest)
            except:
                pass
        raise e

# Check and download ONNX assets if missing
if not os.path.exists(model_path):
    download_file("https://huggingface.co/fastrtc/kokoro-onnx/resolve/main/kokoro-v1.0.onnx", model_path)

if not os.path.exists(voices_path):
    download_file("https://huggingface.co/fastrtc/kokoro-onnx/resolve/main/voices-v1.0.bin", voices_path)

# Auto-install dependencies if not present
required_packages = ["kokoro-onnx", "soundfile", "fastapi", "uvicorn", "pydantic", "numpy", "misaki[zh]"]
try:
    import kokoro_onnx
    import soundfile
    import fastapi
    import uvicorn
    from misaki.zh import ZHG2P
except ImportError:
    print("[Local TTS] Installing python dependencies...")
    subprocess.check_call([sys.executable, "-m", "pip", "install"] + required_packages)
    print("[Local TTS] Dependencies installed successfully!")

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
import tempfile
import soundfile as sf
from kokoro_onnx import Kokoro

app = FastAPI(title="VellumReel Local Offline TTS Server")

print(f"Loading local Kokoro ONNX model from: {model_path}...")
kokoro = Kokoro(model_path, voices_path)
print("Local Kokoro TTS Engine initialized successfully!")

class SpeechRequest(BaseModel):
    model: str = "kokoro"
    input: str
    voice: str = "af_bella"
    speed: float = 1.0

@app.post("/v1/audio/speech")
async def text_to_speech(request: SpeechRequest):
    if not request.input.strip():
        raise HTTPException(status_code=400, detail="Input text cannot be empty.")
    
    has_chinese = any('\u4e00' <= char <= '\u9fff' for char in request.input)
    
    voice = request.voice
    synthesis_text = request.input.strip()
    
    if has_chinese:
        import re
        # Strip generic character name prefix (e.g., "Name: text" or "Name（directions）: text")
        match = re.match(r'^([^：:（(]+)(?:（[^）]+）|\([^)]+\))?[：:]\s*(.*)$', synthesis_text)
        if match:
            synthesis_text = match.group(2).strip()
            
        # Clean parentheticals from speech (e.g. "(旁白)", "（吸气）")
        synthesis_text = re.sub(r'^[（(][^）)]+[）)]\s*', '', synthesis_text).strip()
        # If text is empty (like just a Stage direction "（无旁白）"), yield a short silent audio track
        if not synthesis_text:
            synthesis_text = "..."
            
        # Map voice based on the gender prefix of the requested voice
        if voice.startswith("am_") or voice.startswith("bm_") or voice.startswith("zm_"):
            voice = "zm_yunjian"  # Native Chinese Male
        else:
            voice = "zf_xiaoxiao"  # Native Chinese Female
    else:
        available_voices = ["af_bella", "af_sarah", "bf_emma", "af_nicole", "af_sky", "am_adam", "am_michael", "bf_isabella", "bm_george", "bm_lewis"]
        if voice not in available_voices:
            voice = "af_bella"
        
    try:
        if has_chinese:
            from misaki.zh import ZHG2P
            g2p = ZHG2P()
            phonemes_res = g2p(synthesis_text)
            phonemes = phonemes_res[0] if isinstance(phonemes_res, tuple) else phonemes_res
            print(f"[TTS Synthesizing ZH] '{synthesis_text[:30]}...' -> Phonemes: '{phonemes[:30]}...' -> Voice: {voice}")
            samples, sample_rate = kokoro.create(
                phonemes,
                voice=voice,
                speed=request.speed,
                lang="z",
                is_phonemes=True
            )
        else:
            print(f"[TTS Synthesizing EN] '{synthesis_text[:30]}...' -> Voice: {voice}")
            samples, sample_rate = kokoro.create(
                synthesis_text,
                voice=voice,
                speed=request.speed,
                lang="en-us",
                is_phonemes=False
            )
        
        # Save to temp WAV file
        temp_wav = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        temp_wav.close()
        
        sf.write(temp_wav.name, samples, sample_rate)
        
        # Convert WAV to MP3 using ffmpeg (Remotion and browser friendly)
        temp_mp3 = temp_wav.name.replace(".wav", ".mp3")
        subprocess.run(["ffmpeg", "-y", "-i", temp_wav.name, "-b:a", "192k", temp_mp3], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        # Clean up temporary WAV
        try:
            os.remove(temp_wav.name)
        except:
            pass
            
        return FileResponse(temp_mp3, media_type="audio/mpeg", filename="speech.mp3")
        
    except Exception as e:
        print(f"Synthesis failed: {e}")
        raise HTTPException(status_code=500, detail=f"TTS synthesis error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    import sys
    port = 8000
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass
    else:
        # Check if port 8000 is available, otherwise default to 8001
        import socket
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            s.bind(("127.0.0.1", 8000))
            s.close()
        except OSError:
            port = 8001

    print(f"\nStarting local TTS API server at http://127.0.0.1:{port} ...")
    print(f"Verify endpoint: POST http://127.0.0.1:{port}/v1/audio/speech")
    uvicorn.run(app, host="127.0.0.1", port=port)
