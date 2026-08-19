import {readJson, resolveArg, splitChineseText, writeJson} from './_shared.mjs';

const projectFile = resolveArg('project', 'project.json');
const outputFile = resolveArg('out', 'captions.json');
const leadMs = Number(resolveArg('lead-ms', '800'));
const tailMs = Number(resolveArg('tail-ms', '400'));
const gapMs = Number(resolveArg('gap-ms', '180'));
const maxChars = Number(resolveArg('max-chars', '18'));

const project = await readJson(projectFile);
const chunks = splitChineseText(project.narration, maxChars);
const totalMs = project.format.durationSeconds * 1000;
const usableMs = totalMs - leadMs - tailMs - gapMs * Math.max(0, chunks.length - 1);

if (usableMs <= 0 || chunks.length === 0) {
  throw new Error('无法估算字幕：请检查 narration 和 durationSeconds。');
}

const weights = chunks.map((text) => Math.max(5, [...text].length) + (/[，。！？；]/u.test(text) ? 2 : 0));
const weightTotal = weights.reduce((sum, value) => sum + value, 0);
let cursor = leadMs;

const captions = chunks.map((text, index) => {
  const duration = (weights[index] / weightTotal) * usableMs;
  const caption = {
    startMs: Math.round(cursor),
    endMs: Math.round(cursor + duration),
    text: text.replace(/[，。！？；]$/u, ''),
  };
  cursor += duration + gapMs;
  return caption;
});

await writeJson(outputFile, captions);
console.log(`已写入 ${captions.length} 条估时字幕：${outputFile}`);
console.log('注意：估时只用于无音频预览，发布前请运行 npm run captions:align。');
