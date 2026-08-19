import test from 'node:test';
import assert from 'node:assert/strict';
import {syncProjectTimeline} from '../scripts/timeline.mjs';

test('根据音频缩放分镜并保持无缝衔接', () => {
  const input = {
    format: {durationSeconds: 10},
    scenes: [
      {startMs: 0, endMs: 4000, image: 'a'},
      {startMs: 4000, endMs: 10000, image: 'b'},
    ],
  };
  const {project, targetMs} = syncProjectTimeline({project: input, captions: [], audioMs: 19000, tailMs: 1000});
  assert.equal(targetMs, 20000);
  assert.equal(project.format.durationSeconds, 20);
  assert.deepEqual(
    project.scenes.map(({startMs, endMs}) => [startMs, endMs]),
    [
      [0, 8000],
      [8000, 20000],
    ],
  );
  assert.equal(input.format.durationSeconds, 10, '不应就地修改输入配置');
});

test('字幕比音频更长时不截断字幕', () => {
  const input = {format: {durationSeconds: 10}, scenes: [{startMs: 0, endMs: 10000}]};
  const {targetMs} = syncProjectTimeline({
    project: input,
    captions: [{startMs: 0, endMs: 12500, text: '结尾'}],
    audioMs: 10000,
    tailMs: 500,
  });
  assert.equal(targetMs, 13000);
});
