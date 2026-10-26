const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { fixtures } = require('./fixtures.cjs');
const { compare } = require('./compare.cjs');
const root = path.resolve(__dirname, '../../../..');
async function main() {
  const results = [];
  for (const fixture of fixtures) results.push(await compare(fixture));
  const sources = [ 'server/src/services/novel/runtime/chapterRuntimePipeline.ts', 'server/src/services/novel/runtime/selection/ChapterRepairCandidateSelection.ts',
    'server/src/modules/production/domain/decideNext.ts', 'server/src/modules/production/infrastructure/stages/acceptanceProjection.ts',
    'server/src/modules/production/application/unitExecutor.ts', 'server/src/modules/production/infrastructure/stages/draft.ts',
    'server/tests/production/application/stageAdapters.test.js',
    'server/tests/production/compatibility/fixtures.cjs', 'server/tests/production/compatibility/compare.cjs', 'server/tests/novelProduction/sourceHarness.cjs' ]
    .filter(file => fs.existsSync(path.join(root, file)))
    .map(file => ({ file, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex') }));
  const report = { observedAt: new Date().toISOString(), timezone: 'Asia/Shanghai', approval:'2026-10-23 用户已确认下列四项差异，批准继续默认关闭开关下的接线与验证。',
    compatibilityRestorations:{evidence:'server/tests/production/application/stageAdapters.test.js',existingProse:'保留原文并进入审校，writer 调用为 0。',emptyDraft:'writer 调用为 1，失败后不额外重试。',scope:'独立阶段回归，不列作十组同夹具对照中的额外样本。'},sources, results };
  if (!process.argv.includes('--write')) { process.stdout.write(JSON.stringify(report, null, 2) + '\n'); return; }
  const directory = path.join(root, 'docs/superpowers/reports/production-kernel');
  fs.writeFileSync(path.join(directory, '05-decision-differences-2026-10-23.json'), JSON.stringify(report, null, 2) + '\n');
  const rows = results.map(result => `| ${result.id}：${result.title} | ${result.old.selected} → ${result.kernel.selected} | ${result.old.repairs} → ${result.kernel.repairs} | ${result.old.reviews} → ${result.kernel.reviews} | ${result.old.earlyWrites} → ${result.kernel.earlyWrites} | ${result.old.commits} → ${result.kernel.commits} | ${result.old.synced ? '已回填' : '未回填'} → ${result.kernel.synced ? '已回填' : result.kernel.status === 'paused' ? '保存后暂停，待显式恢复' : '未回填'} |`);
  const markdown = [ '# 05 切换前决策差异：同夹具实跑', '', '状态：2026-10-23 用户已确认下列四项差异并批准继续接线与验证；真实入口未接线，开关未启用。03/05 补充终态发布已有独立临时库证据，不能据此认定整个 05 完成。', '',
    '## 方法与可复查范围', '',
    '同一份结构化审校、分数与候选事实核对结果，分别驱动真实旧 chapterRuntimePipeline/选稿函数，以及真实新阶段适配器/执行器/领域。模型、数据库、上下文与预算用显式替身；旧运行时字段通过测试适配保留相同严重问题、义务与风险。没有调用付费模型，也没有将替身测试说成真实提供方或完整导演批次验收。', '',
    '旧流程分数与结构化结论一起输入；新流程保留结构化结论，不用分数决定修复或采用候选。提前保存指 saveDraftAndArtifacts 调用；最终提交指 commitFinalizedChapterContent/内核 ChapterWrite 调用，不当作实际 SQL 次数。', '',
    '## 本组夹具的全部观察结果', '',
    '| 夹具 | 选稿（旧 → 新） | 修复次数 | 审校/复验次数 | 提前保存调用 | 最终提交调用 | 回填边界 |',
    '| --- | --- | --- | --- | --- | --- | --- |', ...rows, '',
    '## 已确认的行为', '',
    '1. 只有旧分数偏低、结构化审校未报告问题时，新内核直接保留原稿，不因分数追加修复。score_only 由旧候选改为原稿，少一次修复与复验。',
    '2. 所有补丁候选都必须通过绑定原稿和候选哈希的事实核对；事实未知或改变时保留原稿及质量债。facts_unknown/facts_changed 的旧普通补丁选稿可采用候选，新内核拒绝。已有表达修文保护继续保留。',
    '3. 草稿和候选仅保存为运行制品；选稿前不写 Chapter，最终只经原子提交入口保存正文。中途退出时从运行制品恢复，编辑器不会先看到未经采用的候选。',
    '4. 质量优先在正文保存后持久暂停，资产回填等待显式恢复；旧单章运行时先完成回填再向调用方返回质量结果。本对照只观察单章回填时机，不声称旧完整导演不会暂停。', '',
    '## 兼容行为恢复', '',
    '全计划复核曾发现已有正文复用与空草稿重试差异。独立阶段回归已恢复旧行为：非空已有稿保留原始文本并进入审校，writer 调用为 0；空草稿只调用 writer 1 次，随后报告无可用正文。证据为 application/stageAdapters.test.js；这些用例未混入上表十组观察数。', '',
    '## 静态合同变化与独立验证', '',
    '- 阶段 CAS、实际模型请求预约、未知结果禁止自动重发；业务写入与回执同事务；跨运行回执隔离。03 临时库/变异已验证，不能靠本组内存夹具证明并发或提供方严格一次。',
    '- 完整正文不截断后抽取；未知或不足的上下文窗口拒绝调用。读取失败不悄悄替换为空状态，坏的结构化兑现来源拒绝继续。输入体积和错误暴露时机会变化。',
    '- 人物只接受本书 ID 或唯一姓名；省去旧模糊名字匹配。未确认人物保留待确认，资源审核/位置证据/质量债保护保留。',
    '- 严格兑现模型结果与账本提交分开回执；时间线失败保留 degraded，持久化失败保持待恢复，不能吞为完成。RAG 入队与事实事务一致。',
    '- 完成表示正文与资产已闭合，质量债仍可存在；不能把旧 pass=false 与新 completed 直接比较为质量提升。05 的纯映射保留债务与人工/运行异常恢复信号。',
    '- 新批次的快照、旧批次路由固定、三章编辑冲突及真实 V2 装配仍在后续 Task 3/4 验收；本清单不是其完成声明。', '',
    '## 复核', '', '运行 node --test server/tests/production/compatibility/decisions.test.js；重生成使用 node server/tests/production/compatibility/report.cjs --write。旁边 JSON 保存每项观察值与源码 SHA-256，文案与数据一并审查。', '',
    '批准依据：计划 00 第 7 节和计划 05 的“切换前必须完成”要求。确认本清单只授权继续默认关闭开关下的入口接线与验证；启用、业务库迁移、beta/main 合入和发布仍独立处理。', '' ].join('\n');
  fs.writeFileSync(path.join(directory, '05-decision-differences-2026-10-23.md'), markdown);
  process.stdout.write(`Wrote ${results.length} decision comparisons and source fingerprints.\n`);
}
main().catch(error => { process.stderr.write(String(error) + '\n'); process.exitCode = 1; });
