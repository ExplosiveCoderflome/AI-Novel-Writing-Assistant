import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../../db/prisma";

const DEFAULT_SD_URL = "http://127.0.0.1:7860";
const DEFAULT_TTS_URL = "http://127.0.0.1:8000/v1";

async function getSetting(key: string, defaultValue: string): Promise<string> {
  try {
    const setting = await prisma.appSetting.findUnique({ where: { key } });
    return setting?.value || defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * Generate an image offline using local Stable Diffusion WebUI API (txt2img).
 * Returns the relative path of the saved image file under the public/ directory.
 */
export async function generateLocalImage(params: {
  prompt: string;
  projectId: string;
  shotId: string;
  rootDir: string;
}): Promise<string> {
  const sdUrl = await getSetting("video.sdUrl", DEFAULT_SD_URL);
  const url = `${sdUrl.replace(/\/+$/, "")}/sdapi/v1/txt2img`;

  console.log(`[Offline SD] Sending request to SD WebUI: ${url}`);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: params.prompt,
      negative_prompt: "nsfw, worst quality, low quality, duplicate, text, watermark, bad anatomy, deformed",
      steps: 25,
      width: 576,
      height: 1024,
      cfg_scale: 7.0,
      batch_size: 1,
    }),
  });

  if (!response.ok) {
    throw new Error(`Stable Diffusion WebUI returned HTTP ${response.status}: ${await response.text()}`);
  }

  const result = (await response.json()) as { images?: string[] };
  if (!result.images || result.images.length === 0) {
    throw new Error("Stable Diffusion WebUI returned no images in payload.");
  }

  // A1111 returns base64 string
  const base64Data = result.images[0];
  const buffer = Buffer.from(base64Data, "base64");

  const relativePath = `assets/projects/${params.projectId}/images/${params.shotId}.png`;
  const absolutePath = path.join(params.rootDir, "public", relativePath);

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, buffer);
  console.log(`[Offline SD] Saved image to ${absolutePath}`);

  return relativePath;
}

/**
 * Generate audio offline using a local OpenAI-compatible Speech API (e.g. Kokoro TTS / LocalAI).
 * Returns the relative path of the saved audio file under the public/ directory.
 */
export async function generateLocalSpeech(params: {
  text: string;
  projectId: string;
  shotId: string;
  rootDir: string;
  voice?: string;
}): Promise<string> {
  const ttsUrl = await getSetting("video.ttsUrl", DEFAULT_TTS_URL);
  const url = `${ttsUrl.replace(/\/+$/, "")}/audio/speech`;

  console.log(`[Offline TTS] Sending request to local speech API: ${url}`);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "kokoro",
      input: params.text,
      voice: params.voice || "af_bella",
      response_format: "mp3",
    }),
  });

  if (!response.ok) {
    throw new Error(`Local TTS Server returned HTTP ${response.status}: ${await response.text()}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const relativePath = `assets/projects/${params.projectId}/audio/${params.shotId}.mp3`;
  const absolutePath = path.join(params.rootDir, "public", relativePath);

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, buffer);
  console.log(`[Offline TTS] Saved audio to ${absolutePath}`);

  return relativePath;
}
