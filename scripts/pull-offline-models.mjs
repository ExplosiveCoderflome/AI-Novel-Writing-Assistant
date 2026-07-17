import { mkdir, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const DEFAULT_LLM = 'deepseek-r1:8b';

// Whisper models
const WHISPER_MODEL = process.env.WHISPER_MODEL || 'small';
const WHISPER_URL = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${WHISPER_MODEL}.bin`;
const WHISPER_DIR = path.join(rootDir, '.cache', 'whisper.cpp');

// Kokoro models
const KOKORO_ONNX_URL = 'https://huggingface.co/hexgrad/Kokoro-82M/resolve/main/kokoro-v0_19.onnx';
const KOKORO_VOICES = ['af_heart.bin', 'af_bella.bin', 'bf_emma.bin', 'pm_alex.bin', 'pm_santa.bin'];
const KOKORO_VOICE_BASE_URL = 'https://huggingface.co/hexgrad/Kokoro-82M/resolve/main/voices/';
const KOKORO_DIR = path.join(rootDir, '.cache', 'kokoro');

async function downloadFile(url, destPath) {
  console.log(`Starting download: ${url} -> ${destPath}`);
  await mkdir(path.dirname(destPath), { recursive: true });

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  }

  const fileStream = createWriteStream(destPath);
  const reader = response.body.getReader();

  let receivedLength = 0;
  const contentLength = Number(response.headers.get('Content-Length') || '0');

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    fileStream.write(Buffer.from(value));
    receivedLength += value.length;
    if (contentLength > 0 && Math.random() < 0.05) {
      const progress = ((receivedLength / contentLength) * 100).toFixed(1);
      console.log(`Progress: ${progress}% (${(receivedLength / 1024 / 1024).toFixed(1)} / ${(contentLength / 1024 / 1024).toFixed(1)} MB)`);
    }
  }

  fileStream.end();
  console.log(`Successfully saved to ${destPath}`);
}

async function pullOllamaModel(modelName) {
  console.log(`Checking local Ollama instance for: ${modelName}...`);
  try {
    const checkRes = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!checkRes.ok) {
      throw new Error(`Ollama API tags returned ${checkRes.status}`);
    }
    const tagsData = await checkRes.json();
    const modelsList = tagsData.models || [];
    const exists = modelsList.some(m => m.name.startsWith(modelName));
    if (exists) {
      console.log(`✓ Ollama model "${modelName}" is already present.`);
      return;
    }

    console.log(`Ollama model "${modelName}" not found. Sending pull request...`);
    const pullRes = await fetch(`${OLLAMA_URL}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName, stream: false })
    });
    
    if (!pullRes.ok) {
      throw new Error(`Ollama pull API returned ${pullRes.status}`);
    }
    console.log(`✓ Successfully requested Ollama to pull "${modelName}".`);
  } catch (error) {
    console.warn(`Ollama pull failed via HTTP API (${error.message}). Please run:`);
    console.log(`    ollama pull ${modelName}`);
  }
}

async function main() {
  console.log('=== VellumReel Offline Model Puller ===');

  // 1. Ollama
  await pullOllamaModel(DEFAULT_LLM);

  // 2. Whisper Model
  const whisperDest = path.join(WHISPER_DIR, `ggml-${WHISPER_MODEL}.bin`);
  try {
    await downloadFile(WHISPER_URL, whisperDest);
  } catch (e) {
    console.error(`Failed to download Whisper model: ${e.message}`);
  }

  // 3. Kokoro TTS
  console.log('Downloading Kokoro TTS ONNX model...');
  const kokoroModelDest = path.join(KOKORO_DIR, 'kokoro-v0_19.onnx');
  try {
    await downloadFile(KOKORO_ONNX_URL, kokoroModelDest);
  } catch (e) {
    console.error(`Failed to download Kokoro ONNX model: ${e.message}`);
  }

  for (const voice of KOKORO_VOICES) {
    console.log(`Downloading Kokoro Voice profile: ${voice}...`);
    const voiceDest = path.join(KOKORO_DIR, 'voices', voice);
    try {
      await downloadFile(`${KOKORO_VOICE_BASE_URL}${voice}`, voiceDest);
    } catch (e) {
      console.error(`Failed to download voice ${voice}: ${e.message}`);
    }
  }

  console.log('=== Model Pulling Complete ===');
}

main().catch(err => {
  console.error('Fatal error in pull script:', err);
  process.exit(1);
});
