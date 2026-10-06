import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(new URL(`../src/components/layout/${file}`, import.meta.url), 'utf8');

test('global recovery records only open the source page and cannot resume tasks', () => {
  const dialog = read('TaskRecoveryDialog.tsx');
  const provider = read('TaskRecoveryContext.tsx');
  assert.doesNotMatch(dialog, /resumeSingle|resumeAll|继续全部|继续单个/);
  assert.doesNotMatch(provider, /useMutation|resumeRecoveryCandidate|resumeAllRecoveryCandidates|acceptedRecoveryKeys/);
  assert.match(dialog, /to=\{item.sourceRoute\}/);
  assert.match(dialog, /查看已保存结果/);
  assert.match(provider, /listRecoveryCandidates/);
});
