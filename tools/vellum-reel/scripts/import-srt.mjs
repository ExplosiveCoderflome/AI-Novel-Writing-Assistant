import {readFile} from 'node:fs/promises';
import {parseSrt} from '@remotion/captions';
import {resolveArg, writeJson} from './_shared.mjs';

const input = resolveArg('input', 'captions.srt');
const output = resolveArg('out', 'captions.json');
const contents = await readFile(input, 'utf8');
const {captions} = parseSrt({input: contents});

await writeJson(
  output,
  captions
    .filter((caption) => caption.text.trim())
    .map((caption) => ({
      startMs: Math.round(caption.startMs),
      endMs: Math.round(caption.endMs),
      text: caption.text.replace(/\s+/g, '').trim(),
    })),
);

console.log(`已导入 ${captions.length} 条 SRT 字幕：${output}`);
