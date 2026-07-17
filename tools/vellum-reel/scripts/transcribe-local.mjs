import {execFileSync} from 'node:child_process';
import {mkdir, rm} from 'node:fs/promises';
import path from 'node:path';
import {
  downloadWhisperModel,
  installWhisperCpp,
  toCaptions,
  transcribe,
} from '@remotion/install-whisper-cpp';
import {paginateCaptions} from './caption-pages.mjs';
import {publicPath, readJson, resolveArg, root, writeJson} from './_shared.mjs';

const project = await readJson(resolveArg('project', 'project.json'));
const audioRelative = resolveArg('audio', project.audio.narration);
const output = resolveArg('out', 'captions.json');
const model = resolveArg('model', process.env.WHISPER_MODEL ?? 'small');
const maxChars = Number(resolveArg('max-chars', '18'));
const maxDurationMs = Number(resolveArg('max-duration-ms', '4200'));
const whisperVersion = '1.5.5';

if (!audioRelative) {
  throw new Error('请先在 project.json 填写 audio.narration，或传入 --audio=assets/audio/xxx.mp3。');
}

const cacheDir = path.join(root, '.cache');
const whisperPath = path.join(cacheDir, 'whisper.cpp');
const wavPath = path.join(cacheDir, 'narration-16khz.wav');
await mkdir(cacheDir, {recursive: true});

console.log('正在把音频转为 16kHz 单声道 WAV…');
execFileSync('ffmpeg', ['-y', '-i', publicPath(audioRelative), '-ar', '16000', '-ac', '1', wavPath], {
  stdio: 'inherit',
});

console.log(`正在准备 whisper.cpp ${whisperVersion} 与 ${model} 模型…`);
await installWhisperCpp({to: whisperPath, version: whisperVersion});
await downloadWhisperModel({folder: whisperPath, model});

console.log('正在本地对齐字幕，首次运行会因模型下载较慢…');
const whisperCppOutput = await transcribe({
  model,
  whisperPath,
  whisperCppVersion: whisperVersion,
  inputPath: wavPath,
  tokenLevelTimestamps: true,
  language: 'zh',
});
const {captions} = toCaptions({whisperCppOutput});
const pages = paginateCaptions(captions, {maxChars, maxDurationMs});

await writeJson(
  output,
  pages,
);
await rm(wavPath, {force: true});

console.log(`字幕已对齐并合并为 ${pages.length} 个中文可读块，已写入 ${output}。`);
console.log('发布前请人工校对书名、人名和宗教词汇。');
