import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { prisma } from "../../db/prisma";

const execAsync = promisify(exec);
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
 * Falls back to generating a solid color background image using ffmpeg if offline SD is unreachable.
 */
export async function generateLocalImage(params: {
  prompt: string;
  projectId: string;
  shotId: string;
  rootDir: string;
}): Promise<string> {
  const relativePath = `assets/projects/${params.projectId}/images/${params.shotId}.png`;
  const absolutePath = path.join(params.rootDir, "public", relativePath);

  try {
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
      throw new Error(`Stable Diffusion WebUI returned HTTP ${response.status}`);
    }

    const result = (await response.json()) as { images?: string[] };
    if (!result.images || result.images.length === 0) {
      throw new Error("Stable Diffusion WebUI returned no images in payload.");
    }

    const base64Data = result.images[0];
    const buffer = Buffer.from(base64Data, "base64");

    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, buffer);
    console.log(`[Offline SD] Saved image to ${absolutePath}`);

    return relativePath;
  } catch (error) {
    console.warn(`[Offline SD] Stable Diffusion WebUI is offline, copying pre-generated classical Chinese painting placeholder: ${error}`);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    
    // Match shotId to get one of the 6 placeholders (e.g. shot_3 -> shot_3.png)
    const match = params.shotId.match(/shot_(\d+)/);
    const index = match ? parseInt(match[1], 10) : 1;
    const placeholderIndex = ((index - 1) % 6) + 1;
    
    const placeholderRelPath = `assets/placeholders/shot_${placeholderIndex}.png`;
    const placeholderAbsPath = path.join(params.rootDir, "public", placeholderRelPath);
    
    try {
      const fsPromise = require("node:fs/promises");
      await fsPromise.copyFile(placeholderAbsPath, absolutePath);
      console.log(`[Offline SD] Copied default placeholder shot_${placeholderIndex}.png to ${absolutePath}`);
    } catch (copyErr) {
      console.warn(`[Offline SD] Failed to copy placeholder, falling back to solid color: ${copyErr}`);
      const colors = ["#08090a", "#1a120c", "#0c151c", "#101815", "#181016"];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      await execAsync(`ffmpeg -y -f lavfi -i "color=c=${randomColor}:s=576x1024:d=1" -vframes 1 "${absolutePath}"`);
    }
    return relativePath;
  }
}

/**
 * Generate audio offline using a local OpenAI-compatible Speech API (e.g. Kokoro TTS / LocalAI).
 * Falls back to generating a silent audio placeholder via ffmpeg if offline TTS is unreachable.
 */
export async function generateLocalSpeech(params: {
  text: string;
  projectId: string;
  shotId: string;
  rootDir: string;
  voice?: string;
}): Promise<string> {
  const relativePath = `assets/projects/${params.projectId}/audio/${params.shotId}.mp3`;
  const absolutePath = path.join(params.rootDir, "public", relativePath);

  try {
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
      throw new Error(`Local TTS Server returned HTTP ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, buffer);
    console.log(`[Offline TTS] Saved audio to ${absolutePath}`);

    return relativePath;
  } catch (error) {
    console.warn(`[Offline TTS] Local TTS service is offline, generating silent audio placeholder via ffmpeg: ${error}`);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    
    // Estimate speaking rate: about 3.5 Chinese characters per second (minimum 3 seconds)
    const charCount = params.text.trim().length;
    const duration = Math.max(3, Math.ceil(charCount / 3.5));
    
    // Generate silent mp3 via ffmpeg
    await execAsync(`ffmpeg -y -f lavfi -i "anullsrc=r=44100:cl=mono" -t ${duration} "${absolutePath}"`);
    console.log(`[Offline TTS] Saved fallback silent audio (${duration}s) to ${absolutePath}`);
    return relativePath;
  }
}
