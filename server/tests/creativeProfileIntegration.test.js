const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { createRequire } = require('node:module');
const { creativeProfileInputSchema } = require('@ai-novel/shared/types/creativeProfile');
const { buildPreviewChapterWriteContext } = require('../dist/prompting/workbench/writerPreviewContext');
const { buildChapterWriterContextBlocks, buildChapterReviewContextBlocks, buildChapterRepairContextBlocks } = require('../dist/prompting/prompts/novel/chapterLayeredContext');
const { chapterWriterPrompt } = require('../dist/prompting/prompts/novel/chapterWriter.prompts');
const { chapterReviewPrompt, chapterRepairPrompt } = require('../dist/prompting/prompts/novel/review.prompts');
const { compilePromptTemplate, hasBlockingPromptTemplateDiagnostics } = require('../dist/prompting/templates/templateCompiler');
const { getOfficialPromptTemplate } = require('../dist/prompting/templates/officialTemplates');
const { applyCreativeBaselinePolicy, readStoredCreativeProfile, recoverCreativeProfilePreference } = require('../dist/modules/novel/creative-profile');
const { applyCreativeProsePolicy, selectProseRepairFindings } = require('../dist/services/novel/runtime/proseQuality/creativeProsePolicy');
const { preparePromptExecution } = require('../dist/prompting/core/promptRunner');

const profile = creativeProfileInputSchema.parse({ orientation: 'modern_literary',
  strategy: { drive: 'character', conflictScales: ['inner', 'family'], arcShape: 'recognition', allowedChapterEndings: ['resonance', 'quiet_turn'] },
  styleDimensions: { focalization: 'omniscient', narrativeDistance: 'variable', imagery: 'recurring_motifs', dialogue: 'subtext', commentary: 'essayistic', consistencyNotes: '沿用人物各自年代的称谓' },
  namingBackground: { era: '十九世纪末', region: '合成华语港口', languageCulture: '汉语' },
});
function writerContext(value = profile) {
  return buildPreviewChapterWriteContext({
    novel: { id: 'synthetic-book', title: '合成港口', description: '修伞铺两代人的迁居选择', targetAudience: null, bookSellingPoint: null, first30ChapterPromise: null,
      narrativePov: 'third_person', pacePreference: 'slow', emotionIntensity: 'low', creativeProfileJson: value ? JSON.stringify(value) : null },
    chapter: { id: 'synthetic-chapter', title: '潮线', order: 1, content: null, expectation: '人物看清却未必离开', targetWordCount: 1500, mustAvoid: null, taskSheet: null, sceneCards: null, hook: null },
  });
}
function context(blocks) { return { blocks, selectedBlockIds: blocks.map(b => b.id), droppedBlockIds: [], summarizedBlockIds: [], estimatedInputTokens: 0 }; }
const text = messages => messages.map(m => String(m.content)).join('\n');

test('actual writer/review/repair context builders preserve literary choice and close legacy defaults', () => {
  const write = writerContext();
  const blocks = buildChapterWriterContextBlocks(write);
  const protectedBlock = blocks.find(b => b.group === 'creative_profile');
  assert.ok(protectedBlock.required && protectedBlock.priority > 105 && protectedBlock.allowSummary === false);
  assert.match(protectedBlock.content, /十九世纪末|现代文学/);
  assert.match(protectedBlock.content, /全知/);
  assert.match(protectedBlock.content, /意象/);
  assert.match(protectedBlock.content, /潜台词/);
  assert.match(write.chapterMission.hookTarget, /允许的方式/);
  const messages = chapterWriterPrompt.render({ novelTitle: '合成港口', chapterTitle: '潮线', chapterOrder: 1 }, context(blocks));
  assert.equal(messages.filter(m => m._getType() === 'system').length, 1);
  assert.doesNotMatch(messages[0].content, /你是中文长篇网络小说写作助手|禁止整章只有情绪或氛围|结尾必须形成新的钩子|想写大段心理独白 ->/);
  const review = { ...write, structureObligations: [], worldRules: [], historicalIssues: [] };
  const reviewed = text(chapterReviewPrompt.render({ novelTitle: '合成', chapterTitle: '潮线', content: '合成段落', ragContext: '' }, context(buildChapterReviewContextBlocks(review))));
  assert.match(reviewed, /不因没有爽点、升级或章末悬念扣分/);
  const repair = { writeContext: write, issues: [], structureObligations: [], worldRules: [], historicalIssues: [], allowedEditBoundaries: [] };
  const repaired = text(chapterRepairPrompt.render({ novelTitle: '合成', bibleContent: '', chapterTitle: '潮线', chapterContent: '合成段落', issuesJson: '[]', ragContext: '' }, context(buildChapterRepairContextBlocks(repair))));
  assert.doesNotMatch(repaired, /应在不违背既有走向的前提下加强章末压力/);
  assert.match(repaired, /不因缺少钩子/);
});

test('legacy null adds no preference and explicit web serial remains available', () => {
  const legacy = writerContext(null);
  assert.ok(!buildChapterWriterContextBlocks(legacy).some(b => b.group === 'creative_profile'));
  const web = writerContext({ schemaVersion: 1, orientation: 'web_serial' });
  const messages = chapterWriterPrompt.render({ novelTitle: '合成', chapterTitle: '潮线', chapterOrder: 1 }, context(buildChapterWriterContextBlocks(web)));
  assert.match(messages[0].content, /网络小说写作助手/);
  assert.match(text(messages), /创作取向：网文连载/);
  const customWeb = writerContext({ schemaVersion: 1, orientation: 'web_serial', strategy: { allowedChapterEndings: ['quiet_turn'] }, styleDimensions: { focalization: 'omniscient' } });
  const selected = chapterWriterPrompt.render({ novelTitle: '合成', chapterTitle: '潮线', chapterOrder: 1 }, context(buildChapterWriterContextBlocks(customWeb)));
  assert.doesNotMatch(selected[0].content, /结尾必须形成新的钩子|第三人称有限视角/);
  const broken = writerContext();
  broken.bookContract.creativeProfileJson = '{synthetic broken';
  const neutral = buildChapterWriterContextBlocks(broken);
  assert.match(neutral.find(block => block.group === 'creative_profile').content, /暂时无法读取/);
  assert.doesNotMatch(chapterWriterPrompt.render({ novelTitle: '合成', chapterTitle: '潮线', chapterOrder: 1 }, context(neutral))[0].content, /网络小说写作助手/);
});

test('author-edited writing slots remain explicit choices', () => {
  const ctx = context(buildChapterWriterContextBlocks(writerContext()));
  ctx.slots = { text: key => key === 'writer.endingHookPreference' ? '用户明确的结束要求' : undefined,
    choiceCopy: key => key === 'writer.pov' ? '用户明确的聚焦要求' : undefined, enabled: () => false, token: () => undefined };
  const messages = chapterWriterPrompt.render({ novelTitle: '合成', chapterTitle: '潮线', chapterOrder: 1 }, ctx);
  assert.match(messages[0].content, /用户明确的结束要求/);
  assert.match(messages[0].content, /用户明确的聚焦要求/);
  assert.doesNotMatch(messages[0].content, /避免使用破折号、省略号/);
});

test('active preference survives budget selection and advanced template cannot omit it', () => {
  const write = writerContext();
  const blocks = buildChapterWriterContextBlocks(write);
  const prepared = preparePromptExecution({ asset: chapterWriterPrompt, promptInput: { novelTitle: '合成', chapterTitle: '潮线', chapterOrder: 1 }, contextBlocks: blocks });
  assert.ok(prepared.context.blocks.some(b => b.group === 'creative_profile'));
  const ctx = context(blocks);
  const allowed = [...new Set(blocks.map(b => b.group))];
  const missing = compilePromptTemplate({ template: { kind: 'chat', messages: [{ role: 'system', content: '用户模板' }, { role: 'human', content: '写正文' }] }, promptInput: {}, context: ctx, slotDefs: chapterWriterPrompt.slots, allowedContextGroups: allowed, requiredContextGroups: ['chapter_mission'] });
  assert.ok(hasBlockingPromptTemplateDiagnostics(missing.diagnostics));
  assert.match(missing.diagnostics.invalidMessages.join(' '), /创作取向/);
  const official = compilePromptTemplate({ template: getOfficialPromptTemplate('novel.chapter.writer'), promptInput: { novelTitle: '合成', chapterTitle: '潮线', chapterOrder: 1, mode: 'draft', targetWordCount: 1500, minWordCount: 1000, maxWordCount: 2000 }, context: ctx, slotDefs: chapterWriterPrompt.slots, allowedContextGroups: [...new Set([...allowed, ...chapterWriterPrompt.contextRequirements.map(item => item.group)])], requiredContextGroups: ['chapter_mission'] });
  assert.equal(hasBlockingPromptTemplateDiagnostics(official.diagnostics), false, JSON.stringify(official.diagnostics));
  assert.match(text(official.messages), /现代文学/);
});

test('standard broker and workbench context route resolve the protected preference', async () => {
  const { ContextBroker } = require('../dist/prompting/context/ContextBroker');
  const { createDefaultContextResolverRegistry } = require('../dist/prompting/context/defaultContextRegistry');
  const broker = new ContextBroker(createDefaultContextResolverRegistry());
  const resolved = await broker.resolve({
    executionContext: { entrypoint: 'manual_test', metadata: { chapterWriteContext: writerContext() } },
    requirements: chapterWriterPrompt.contextRequirements, maxTokensBudget: 100,
  });
  const selected = resolved.blocks.find(block => block.group === 'creative_profile');
  assert.ok(selected?.required);
  assert.match(selected.content, /现代文学/);
  assert.ok(!resolved.resolverErrors.some(error => error.group === 'creative_profile'));
});

test('global narration defaults become risks, while web/null retain original policy', () => {
  const rule = { id: 'synthetic-default', key: 'forbid-explicit-psychology', name: '默认心理规则', type: 'forbidden', severity: 'high', description: '', detectPatterns: [], autoRewrite: true, enabled: true, globalBaselineEnabled: true, createdAt: '', updatedAt: '' };
  const rules = [rule];
  assert.equal(applyCreativeBaselinePolicy(rules, { status: 'unset' }), rules);
  const changed = applyCreativeBaselinePolicy(rules, readStoredCreativeProfile({ creativeProfileJson: JSON.stringify(profile) }));
  assert.equal(changed[0].autoRewrite, false);
  assert.equal(changed[0].type, 'risk');
  assert.equal(rule.autoRewrite, true);
  const surface = { findings: [{ code: 'prose_dash_or_ellipsis', severity: 'high', fixSuggestion: '' }, { code: 'prose_placeholder_leak', severity: 'high', fixSuggestion: '' }], hasBlockingFindings: true };
  const policy = applyCreativeProsePolicy(surface, { creativeProfileJson: JSON.stringify(profile) });
  assert.equal(policy.findings[0].severity, 'low');
  assert.equal(policy.findings[1].severity, 'high');
  assert.equal(policy.hasBlockingFindings, true);
  assert.deepEqual(selectProseRepairFindings(policy, { creativeProfileJson: JSON.stringify(profile) }).map(finding => finding.code), ['prose_placeholder_leak']);
  assert.equal(selectProseRepairFindings(surface, { creativeProfileJson: null }), surface.findings);
});

function frontendModule(relative) {
  const filename = path.resolve(__dirname, '../../client/src', relative);
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const result = { exports: {} };
  new Function('require', 'module', 'exports', output)(createRequire(filename), result, result.exports);
  return result.exports;
}
test('frontend save and director payload round-trip, omitted corrupted value does not clear', () => {
  const form = frontendModule('pages/novels/novelBasicInfo.shared.ts');
  const director = frontendModule('pages/novels/components/NovelAutoDirectorDialog.shared.ts');
  const legacy = form.createDefaultNovelBasicFormState();
  assert.equal(form.buildNovelUpdatePayload(legacy).creativeProfile, null);
  const selected = { ...legacy, creativeProfile: profile };
  assert.deepEqual(form.buildNovelCreatePayload(selected).creativeProfile, profile);
  assert.deepEqual(form.buildNovelUpdatePayload(selected).creativeProfile, profile);
  assert.deepEqual(director.buildAutoDirectorRequestPayload(selected, '合成想法', {}, 'auto_to_ready').creativeProfile, profile);
  assert.ok(!Object.hasOwn(form.buildNovelUpdatePayload({ ...selected, creativeProfile: undefined }), 'creativeProfile'));
  assert.equal(recoverCreativeProfilePreference(null, profile), null);
  assert.deepEqual(recoverCreativeProfilePreference(undefined, profile), profile);
  assert.equal(recoverCreativeProfilePreference(undefined, null, profile), null);
  assert.throws(() => recoverCreativeProfilePreference(undefined, { orientation: 'broken' }, profile), /无法读取/);
});

test('additive migrations contain exactly the approved nullable field for both databases', () => {
  const root = path.resolve(__dirname, '../src/prisma');
  const file = '20261025120000_novel_creative_profile/migration.sql';
  const pg = fs.readFileSync(path.join(root, 'migrations', file), 'utf8').trim();
  assert.equal(pg, 'ALTER TABLE "Novel" ADD COLUMN "creativeProfileJson" TEXT;');
  assert.equal(fs.readFileSync(path.join(root, 'migrations.sqlite', file), 'utf8').trim(), pg);
});
