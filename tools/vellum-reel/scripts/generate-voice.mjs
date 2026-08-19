import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {publicPath, readJson, resolveArg} from './_shared.mjs';

const project = await readJson(resolveArg('project', 'project.json'));
const apiKey = process.env.ELEVENLABS_API_KEY;
const voiceId = process.env.ELEVENLABS_VOICE_ID;
const modelId = process.env.ELEVENLABS_MODEL_ID ?? 'eleven_multilingual_v2';
const speed = Number(process.env.VOICE_SPEED ?? '0.88');
const outputRelative = resolveArg('out', 'assets/audio/narration.mp3');
const output = publicPath(outputRelative);

if (!apiKey || !voiceId) {
  throw new Error('缺少 ELEVENLABS_API_KEY 或 ELEVENLABS_VOICE_ID。请参照 .env.example 设置环境变量。');
}

const text = project.narration.join('\n');
const response = await fetch(
  `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      language_code: 'zh',
      voice_settings: {
        stability: 0.68,
        similarity_boost: 0.72,
        style: 0.16,
        use_speaker_boost: true,
        speed,
      },
    }),
  },
);

if (!response.ok) {
  throw new Error(`ElevenLabs 生成失败 (${response.status})：${await response.text()}`);
}

await mkdir(path.dirname(output), {recursive: true});
await writeFile(output, Buffer.from(await response.arrayBuffer()));

// Read once to make truncated writes fail loudly on unusual filesystems.
const bytes = (await readFile(output)).byteLength;
console.log(`旁白已生成：${outputRelative} (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
console.log(`请将 project.json 的 audio.narration 设为 "${outputRelative}"，然后运行 npm run captions:align。`);
