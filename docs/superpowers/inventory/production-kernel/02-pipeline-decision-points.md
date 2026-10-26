# 单章决策点与边界

基线：7f06e54b；盘点日期：2026-10-22。代码证据为定位与职责依据，不表示这些规则均已通过测试；有冲突或缺口的项目另列在报告。

AST 枚举 if、三元表达式、break、return、throw。执行器条目保留与单章共享的围栏和预算，纯批次投影标为 caller。条件栏保留表达式供复核，不将技术分支误写成 AI 语义判断。

| ID | 位置（路径:行号） | 条件（用自然语言复述） | 结果 | 输入来源 | 对应规则 ID | 内核归属 |
| --- | --- | --- | --- | --- | --- | --- |
| D001 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:222 | runPipelineChapterWithRuntime：满足条件 autoRepair && repairMode !== "detect_only"；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | R163 | caller |
| D002 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:223 | runPipelineChapterWithRuntime：满足条件 artifactSyncPolicy === "director_v2"；进入条件分支 | 其他：执行对应分支 | 调用方参数 | R163 | caller |
| D003 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:226 | runPipelineChapterWithRuntime：满足条件 saved；进入条件分支 | 其他：执行对应分支 | 调用方参数 | R163 | caller |
| D004 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:226 | runPipelineChapterWithRuntime：满足条件 saved；返回当前结果 | 其他：执行对应分支 | 调用方参数 | R163 | caller |
| D005 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:232 | runPipelineChapterWithRuntime：满足条件 assembled.chapter.content?.trim()；在两种结果之间选择 | 其他：执行对应分支 | 混合 | R004 | stage:draft |
| D006 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:257 | runPipelineChapterWithRuntime：满足条件 !content.trim()；进入条件分支 | 其他：生成非空正文 | 混合 | R004 | stage:draft |
| D007 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:268 | runPipelineChapterWithRuntime：满足条件 !generatedDraft.artifactsAlreadySynced；进入条件分支 | 其他：执行对应分支 | 混合 | R004 | stage:draft |
| D008 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:277 | runPipelineChapterWithRuntime：满足条件 !autoReview；进入条件分支 | 其他：执行对应分支 | 混合 | R081 | decision |
| D009 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:296 | runPipelineChapterWithRuntime：满足条件 artifactSyncPolicy === "director_v2"；进入条件分支 | 其他：执行对应分支 | 混合 | R081 | decision |
| D010 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:297 | runPipelineChapterWithRuntime：满足条件 !autoReview；返回当前结果 | 其他：执行对应分支 | 混合 | R081 | decision |
| D011 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:302 | runPipelineChapterWithRuntime：满足条件 attempt > 0；在两种结果之间选择 | 其他：执行对应分支 | AI 结构化输出 | R056 | stage:select |
| D012 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:309 | runPipelineChapterWithRuntime：满足条件 priorAssessment；在两种结果之间选择 | 其他：执行对应分支 | AI 结构化输出 | R056 | stage:select |
| D013 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:322 | runPipelineChapterWithRuntime：满足条件 rewriteGuard && attempt > 0；进入条件分支 | 其他：执行对应分支 | AI 结构化输出 | R056 | stage:select |
| D014 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:327 | runPipelineChapterWithRuntime：满足条件 check.code === "semantic_facts"；在两种结果之间选择 | 其他：执行对应分支 | AI 结构化输出 | R056 | stage:select |
| D015 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:328 | runPipelineChapterWithRuntime：满足条件 valid；在两种结果之间选择 | 其他：执行对应分支 | AI 结构化输出 | R056 | stage:select |
| D016 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:328 | runPipelineChapterWithRuntime：满足条件 valid；在两种结果之间选择 | 其他：执行对应分支 | AI 结构化输出 | R056 | stage:select |
| D017 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:349 | runPipelineChapterWithRuntime：满足条件 attempt === 0；进入条件分支 | 其他：执行对应分支 | AI 结构化输出 | R056 | stage:select |
| D018 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:357 | runPipelineChapterWithRuntime：满足条件 !originalEvaluation；进入条件分支 | 其他：执行对应分支 | AI 结构化输出 | R056 | stage:select |
| D019 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:358 | runPipelineChapterWithRuntime：满足条件 !originalEvaluation；抛出异常 | 失败 | AI 结构化输出 | R056 | stage:select |
| D020 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:360 | runPipelineChapterWithRuntime：满足条件 pass；在两种结果之间选择 | 其他：执行对应分支 | AI 结构化输出 | R056 | stage:select |
| D021 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:378 | runPipelineChapterWithRuntime：满足条件 repairSelection.selected === "candidate"；进入条件分支 | 采用候选稿 | AI 结构化输出 | R056 | stage:select |
| D022 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:379 | runPipelineChapterWithRuntime：满足条件 rewriteGuard && latestResult.runtimePackage.styleReview；进入条件分支 | 其他：执行对应分支 | AI 结构化输出 | R056 | stage:select |
| D023 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:394 | runPipelineChapterWithRuntime：满足条件 rewriteGuard && latestResult.runtimePackage.styleReview；进入条件分支 | 其他：执行对应分支 | AI 结构化输出 | R056 | stage:select |
| D024 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:396 | runPipelineChapterWithRuntime：满足条件 !(attempt === 0)；结束当前循环 | 结束 | AI 结构化输出 | R056 | stage:select |
| D025 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:399 | runPipelineChapterWithRuntime：满足条件 pass；进入条件分支 | 其他：执行对应分支 | AI 结构化输出 | R056 | stage:select |
| D026 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:400 | runPipelineChapterWithRuntime：满足条件 pass；结束当前循环 | 结束 | 混合 | R054 | decision |
| D027 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:404 | runPipelineChapterWithRuntime：满足条件 attempt === 0；进入条件分支 | 其他：执行对应分支 | 混合 | R054 | decision |
| D028 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:412 | runPipelineChapterWithRuntime：满足条件 shouldPauseForAcceptance &#124;&#124; !autoRepair &#124;&#124; repairMode === "detect_only" &#124;&#124; attempt >= effectiveMaxRetries；进入条件分支 | 其他：执行对应分支 | 混合 | R054 | decision |
| D029 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:413 | runPipelineChapterWithRuntime：满足条件 shouldPauseForAcceptance &#124;&#124; !autoRepair &#124;&#124; repairMode === "detect_only" &#124;&#124; attempt >= effectiveMaxRetries；结束当前循环 | 结束 | 混合 | R054 | decision |
| D030 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:415 | runPipelineChapterWithRuntime：满足条件 shouldDeferNonPatchableReviewRisk(latestResult.runtimePackage)；进入条件分支 | 保留原稿 | 混合 | R054 | decision |
| D031 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:425 | runPipelineChapterWithRuntime：满足条件 shouldDeferNonPatchableReviewRisk(latestResult.runtimePackage)；结束当前循环 | 结束 | 混合 | R054 | decision |
| D032 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:427 | runPipelineChapterWithRuntime：满足条件 styleLeakageIssues.length === 0 && !shouldAttemptAutomaticRepair(latestResult.runtimePackage, repairMode)；进入条件分支 | 其他：执行对应分支 | 混合 | R054 | decision |
| D033 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:428 | runPipelineChapterWithRuntime：满足条件 styleLeakageIssues.length === 0 && !shouldAttemptAutomaticRepair(latestResult.runtimePackage, repairMode)；结束当前循环 | 结束 | 混合 | R054 | decision |
| D034 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:434 | runPipelineChapterWithRuntime：满足条件 await hooks.onRetryConsumed?.("quality_repair") === false；进入条件分支 | 其他：执行对应分支 | 混合 | R054 | decision |
| D035 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:434 | runPipelineChapterWithRuntime：满足条件 await hooks.onRetryConsumed?.("quality_repair") === false；结束当前循环 | 结束 | 混合 | R054 | decision |
| D036 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:452 | runPipelineChapterWithRuntime：满足条件 repairResult.recoverableFailure；进入条件分支 | 保留原稿 | 混合 | R054 | decision |
| D037 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:453 | runPipelineChapterWithRuntime：满足条件 rewriteGuard && latestResult.runtimePackage.styleReview；进入条件分支 | 其他：执行对应分支 | 混合 | R054 | decision |
| D038 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:456 | runPipelineChapterWithRuntime：满足条件 repairResult.recoverableFailure；结束当前循环 | 结束 | 混合 | R054 | decision |
| D039 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:459 | runPipelineChapterWithRuntime：满足条件 repairResult.content === content；进入条件分支 | 其他：执行对应分支 | 混合 | R054 | decision |
| D040 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:459 | runPipelineChapterWithRuntime：满足条件 repairResult.content === content；结束当前循环 | 结束 | 混合 | R054 | decision |
| D041 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:461 | runPipelineChapterWithRuntime：满足条件 newProseFindings.length > 0；进入条件分支 | 其他：执行对应分支 | AI 结构化输出 | R087 | stage:select |
| D042 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:470 | runPipelineChapterWithRuntime：满足条件 newProseFindings.length > 0；结束当前循环 | 结束 | AI 结构化输出 | R087 | stage:select |
| D043 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:475 | runPipelineChapterWithRuntime：满足条件 !latestResult；进入条件分支 | 其他：执行对应分支 | 混合 | 无 | decision |
| D044 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:476 | runPipelineChapterWithRuntime：满足条件 !latestResult；抛出异常 | 失败 | 混合 | 无 | decision |
| D045 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:488 | runPipelineChapterWithRuntime：满足条件 !pass；在两种结果之间选择 | 其他：执行对应分支 | 混合 | R075 | stage:reconcile |
| D046 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:500 | runPipelineChapterWithRuntime：满足条件 reviewRetries；进入条件分支 | 其他：执行对应分支 | 混合 | R075 | stage:reconcile |
| D047 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:515 | runPipelineChapterWithRuntime：满足条件 finalResult.reviewRetries；进入条件分支 | 其他：执行对应分支 | 混合 | R075 | stage:reconcile |
| D048 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:517 | runPipelineChapterWithRuntime：满足条件 artifactSyncPolicy === "director_v2"；进入条件分支 | 其他：执行对应分支 | 混合 | R075 | stage:reconcile |
| D049 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:520 | runPipelineChapterWithRuntime：到达当前执行位置；返回当前结果 | 其他：执行对应分支 | 混合 | R075 | stage:reconcile |
| D050 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:536 | resumeFinalizedPipelineChapter：满足条件 saved.result.pass；在两种结果之间选择 | 结束 | 混合 | R163 | stage:reconcile |
| D051 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:540 | resumeFinalizedPipelineChapter：满足条件 saved.result.pass；在两种结果之间选择 | 结束 | 混合 | R163 | stage:reconcile |
| D052 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:541 | resumeFinalizedPipelineChapter：到达当前执行位置；返回当前结果 | 结束 | 混合 | R163 | stage:reconcile |
| D053 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:728 | repairDraftContent：满足条件 !(error instanceof ChapterPatchRepairFailedError)；进入条件分支 | 保留原稿 | 混合 | R059 | stage:repair |
| D054 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:729 | repairDraftContent：满足条件 !(error instanceof ChapterPatchRepairFailedError)；抛出异常 | 失败 | 混合 | R059 | stage:repair |
| D055 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:731 | repairDraftContent：到达当前执行位置；返回当前结果 | 保留原稿 | 混合 | R059 | stage:repair |
| D056 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:739 | repairDraftContent：满足条件 error.plan?.requiresFullRewrite；在两种结果之间选择 | 保留原稿 | 混合 | R059 | stage:repair |
| D057 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:744 | repairDraftContent：到达当前执行位置；返回当前结果 | 保留原稿 | 混合 | R059 | stage:repair |
| D058 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:745 | repairDraftContent：满足条件 repaired.content.trim()；在两种结果之间选择 | 保留原稿 | 混合 | R059 | stage:repair |
| D059 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:756 | shouldDeferNonPatchableReviewRisk：到达当前执行位置；返回当前结果 | 记录质量债 | 混合 | R060 | decision |
| D060 | server/src/services/novel/runtime/chapterRuntimePipeline.ts:811 | buildQualityDebtAttribution：到达当前执行位置；返回当前结果 | 记录质量债 | 混合 | R075 | stage:reconcile |
| D061 | server/src/services/novel/runtime/selection/ChapterRepairCandidateSelection.ts:52 | selectChapterRepairCandidate：满足条件 input.candidate.assessmentVerified === false &#124;&#124; (guard && ( guard.sourceContentHash !== base.originalContentHash &#124;&#124; guard.candidateContentHash !== base.candidateContentHash &#124;&#124; guard.checks.some(check => check.status !== "passed") &#124;&#124; ["patch_scope", "edit_budget", "protected_terms", "semantic_facts"].some(code => !guard.checks.some(check => check.code === code)) ))；进入条件分支 | 保留原稿 | AI 结构化输出 | R056 | stage:select |
| D062 | server/src/services/novel/runtime/selection/ChapterRepairCandidateSelection.ts:57 | selectChapterRepairCandidate：满足条件 input.candidate.assessmentVerified === false &#124;&#124; (guard && ( guard.sourceContentHash !== base.originalContentHash &#124;&#124; guard.candidateContentHash !== base.candidateContentHash &#124;&#124; guard.checks.some(check => check.status !== "passed") &#124;&#124; ["patch_scope", "edit_budget", "protected_terms", "semantic_facts"].some(code => !guard.checks.some(check => check.code === code)) ))；返回当前结果 | 保留原稿 | AI 结构化输出 | R056 | stage:select |
| D063 | server/src/services/novel/runtime/selection/ChapterRepairCandidateSelection.ts:63 | selectChapterRepairCandidate：满足条件 addedSevereIssues.length > 0；进入条件分支 | 保留原稿 | AI 结构化输出 | R056 | stage:select |
| D064 | server/src/services/novel/runtime/selection/ChapterRepairCandidateSelection.ts:64 | selectChapterRepairCandidate：满足条件 addedSevereIssues.length > 0；返回当前结果 | 保留原稿 | AI 结构化输出 | R056 | stage:select |
| D065 | server/src/services/novel/runtime/selection/ChapterRepairCandidateSelection.ts:72 | selectChapterRepairCandidate：满足条件 addedMissingObligations.length > 0 &#124;&#124; candidateMissing.size > originalMissing.size；进入条件分支 | 保留原稿 | AI 结构化输出 | R056 | stage:select |
| D066 | server/src/services/novel/runtime/selection/ChapterRepairCandidateSelection.ts:74 | selectChapterRepairCandidate：满足条件 addedMissingObligations.length > 0 &#124;&#124; candidateMissing.size > originalMissing.size；返回当前结果 | 保留原稿 | AI 结构化输出 | R056 | stage:select |
| D067 | server/src/services/novel/runtime/selection/ChapterRepairCandidateSelection.ts:82 | selectChapterRepairCandidate：满足条件 input.candidate.pass && !input.original.pass；进入条件分支 | 采用候选稿 | AI 结构化输出 | R056 | stage:select |
| D068 | server/src/services/novel/runtime/selection/ChapterRepairCandidateSelection.ts:83 | selectChapterRepairCandidate：满足条件 input.candidate.pass && !input.original.pass；返回当前结果 | 采用候选稿 | AI 结构化输出 | R056 | stage:select |
| D069 | server/src/services/novel/runtime/selection/ChapterRepairCandidateSelection.ts:93 | selectChapterRepairCandidate：满足条件 candidateBlocking < originalBlocking；进入条件分支 | 采用候选稿 | AI 结构化输出 | R056 | stage:select |
| D070 | server/src/services/novel/runtime/selection/ChapterRepairCandidateSelection.ts:94 | selectChapterRepairCandidate：满足条件 candidateBlocking < originalBlocking；返回当前结果 | 采用候选稿 | AI 结构化输出 | R056 | stage:select |
| D071 | server/src/services/novel/runtime/selection/ChapterRepairCandidateSelection.ts:104 | selectChapterRepairCandidate：满足条件 candidateMissing.size < originalMissing.size &#124;&#124; candidateIssueCount < originalIssueCount；进入条件分支 | 采用候选稿 | AI 结构化输出 | R056 | stage:select |
| D072 | server/src/services/novel/runtime/selection/ChapterRepairCandidateSelection.ts:105 | selectChapterRepairCandidate：满足条件 candidateMissing.size < originalMissing.size &#124;&#124; candidateIssueCount < originalIssueCount；返回当前结果 | 采用候选稿 | AI 结构化输出 | R056 | stage:select |
| D073 | server/src/services/novel/runtime/selection/ChapterRepairCandidateSelection.ts:113 | selectChapterRepairCandidate：到达当前执行位置；返回当前结果 | 保留原稿 | AI 结构化输出 | R056 | stage:select |
| D074 | server/src/services/novel/runtime/selection/ChapterRepairCandidateSelection.ts:122 | hashContent：到达当前执行位置；返回当前结果 | 保留原稿 | AI 结构化输出 | R056 | stage:select |
| D075 | server/src/services/novel/runtime/selection/ChapterRepairCandidateSelection.ts:126 | collectSevereIssueKeys：到达当前执行位置；返回当前结果 | 保留原稿 | AI 结构化输出 | R056 | stage:select |
| D076 | server/src/services/novel/runtime/selection/ChapterRepairCandidateSelection.ts:136 | collectMissingObligationKeys：到达当前执行位置；返回当前结果 | 保留原稿 | AI 结构化输出 | R056 | stage:select |
| D077 | server/src/services/novel/runtime/selection/ChapterRepairCandidateSelection.ts:143 | countBlockingIssues：到达当前执行位置；返回当前结果 | 保留原稿 | AI 结构化输出 | R056 | stage:select |
| D078 | server/src/services/novel/runtime/selection/ChapterRepairCandidateSelection.ts:145 | countBlockingIssues：满足条件 evaluation.runtimePackage.audit.hasBlockingIssues；在两种结果之间选择 | 保留原稿 | AI 结构化输出 | R056 | stage:select |
| D079 | server/src/services/novel/runtime/selection/ChapterRepairCandidateSelection.ts:150 | normalizeKey：到达当前执行位置；返回当前结果 | 保留原稿 | AI 结构化输出 | R056 | stage:select |
| D080 | server/src/services/novel/runtime/repair/ChapterRepairEligibility.ts:12 | shouldAttemptAutomaticRepair：满足条件 !hasIntegrityFinding && meta?.continuePolicy === "continue" && (meta.acceptanceStatus === "accepted" &#124;&#124; meta.acceptanceStatus === "continue_with_risk")；进入条件分支 | 其他：判断局部修复资格 | AI 结构化输出 | R108 | decision |
| D081 | server/src/services/novel/runtime/repair/ChapterRepairEligibility.ts:15 | shouldAttemptAutomaticRepair：满足条件 !hasIntegrityFinding && meta?.continuePolicy === "continue" && (meta.acceptanceStatus === "accepted" &#124;&#124; meta.acceptanceStatus === "continue_with_risk")；返回当前结果 | 其他：判断局部修复资格 | AI 结构化输出 | R108 | decision |
| D082 | server/src/services/novel/runtime/repair/ChapterRepairEligibility.ts:19 | shouldAttemptAutomaticRepair：满足条件 repairMode !== "heavy_repair" && directives.length > 0 && directives.every(directive => directive.mode !== "patch")；进入条件分支 | 其他：判断局部修复资格 | AI 结构化输出 | R108 | decision |
| D083 | server/src/services/novel/runtime/repair/ChapterRepairEligibility.ts:21 | shouldAttemptAutomaticRepair：满足条件 repairMode !== "heavy_repair" && directives.length > 0 && directives.every(directive => directive.mode !== "patch")；返回当前结果 | 其他：判断局部修复资格 | AI 结构化输出 | R108 | decision |
| D084 | server/src/services/novel/runtime/repair/ChapterRepairEligibility.ts:23 | shouldAttemptAutomaticRepair：到达当前执行位置；返回当前结果 | 其他：判断局部修复资格 | AI 结构化输出 | R108 | decision |
| D085 | server/src/services/novel/production/qualityClosure/ChapterQualityClosure.ts:44 | applyChapterQualityClosure：满足条件 chapterResult.pass &#124;&#124; replanRecommendation?.scope === "global_book"；在两种结果之间选择 | 停止并重规划 | 混合 | R072 | decision |
| D086 | server/src/services/novel/production/qualityClosure/ChapterQualityClosure.ts:52 | applyChapterQualityClosure：满足条件 decision.action === "auto_retry"；进入条件分支 | 记录质量债 | 混合 | R072 | decision |
| D087 | server/src/services/novel/production/qualityClosure/ChapterQualityClosure.ts:53 | applyChapterQualityClosure：满足条件 decision.action === "auto_retry"；抛出异常 | 记录质量债 | 混合 | R072 | decision |
| D088 | server/src/services/novel/production/qualityClosure/ChapterQualityClosure.ts:55 | applyChapterQualityClosure：满足条件 decision.action === "pause_for_manual" &#124;&#124; decision.action === "fail_task"；进入条件分支 | 暂停等待人工 | 混合 | R072 | decision |
| D089 | server/src/services/novel/production/qualityClosure/ChapterQualityClosure.ts:61 | applyChapterQualityClosure：满足条件 runtimePayload.autoReview && !chapterResult.reviewExecuted && !chapterResult.reviewRetries?.exhausted；进入条件分支 | 记录质量债 | 混合 | R072 | decision |
| D090 | server/src/services/novel/production/qualityClosure/ChapterQualityClosure.ts:63 | applyChapterQualityClosure：满足条件 !input.qualityAlertDetails.includes(detail)；进入条件分支 | 记录质量债 | 混合 | R072 | decision |
| D091 | server/src/services/novel/production/qualityClosure/ChapterQualityClosure.ts:83 | applyChapterQualityClosure：满足条件 chapterResult.recoverableRepairFailure && !chapterResult.reviewRetries?.exhausted；进入条件分支 | 记录质量债 | 混合 | R072 | decision |
| D092 | server/src/services/novel/production/qualityClosure/ChapterQualityClosure.ts:113 | applyChapterQualityClosure：满足条件 chapterResult.reviewExecuted；进入条件分支 | 记录质量债 | 混合 | R072 | decision |
| D093 | server/src/services/novel/production/qualityClosure/ChapterQualityClosure.ts:116 | applyChapterQualityClosure：满足条件 chapterResult.reviewExecuted &#124;&#124; runtimePayload.autoReview &#124;&#124; input.authorRevision；进入条件分支 | 记录质量债 | 混合 | R072 | decision |
| D094 | server/src/services/novel/production/qualityClosure/ChapterQualityClosure.ts:124 | applyChapterQualityClosure：满足条件 chapterResult.retryCountUsed > 0；在两种结果之间选择 | 记录质量债 | 混合 | R072 | decision |
| D095 | server/src/services/novel/production/qualityClosure/ChapterQualityClosure.ts:134 | applyChapterQualityClosure：满足条件 error instanceof Error；在两种结果之间选择 | 记录质量债 | 混合 | R072 | decision |
| D096 | server/src/services/novel/production/qualityClosure/ChapterQualityClosure.ts:140 | applyChapterQualityClosure：满足条件 retries?.exhausted && !chapterResult.pass && replanRecommendation?.scope !== "global_book"；进入条件分支 | 停止并重规划 | 混合 | R072 | decision |
| D097 | server/src/services/novel/production/qualityClosure/ChapterQualityClosure.ts:141 | applyChapterQualityClosure：满足条件 retries.onExhausted === "pause_for_manual"；在两种结果之间选择 | 暂停等待人工 | 混合 | R072 | decision |
| D098 | server/src/services/novel/production/qualityClosure/ChapterQualityClosure.ts:142 | applyChapterQualityClosure：满足条件 !input.qualityAlertDetails.includes(detail)；进入条件分支 | 记录质量债 | 混合 | R072 | decision |
| D099 | server/src/services/novel/production/qualityClosure/ChapterQualityClosure.ts:145 | applyChapterQualityClosure：满足条件 input.governance；进入条件分支 | 记录质量债 | 混合 | R072 | decision |
| D100 | server/src/services/novel/production/qualityClosure/ChapterQualityClosure.ts:155 | applyChapterQualityClosure：满足条件 retries?.exhausted && !chapterResult.pass && replanRecommendation?.scope !== "global_book"；返回当前结果 | 停止并重规划 | 混合 | R072 | decision |
| D101 | server/src/services/novel/production/qualityClosure/ChapterQualityClosure.ts:158 | applyChapterQualityClosure：满足条件 chapterResult.reviewExecuted && !chapterResult.pass；进入条件分支 | 记录质量债 | 混合 | R072 | decision |
| D102 | server/src/services/novel/production/qualityClosure/ChapterQualityClosure.ts:196 | applyChapterQualityClosure：满足条件 shouldStopAfterCurrentChapter；进入条件分支 | 记录质量债 | 混合 | R072 | decision |
| D103 | server/src/services/novel/production/qualityClosure/ChapterQualityClosure.ts:197 | applyChapterQualityClosure：满足条件 shouldStopAfterCurrentChapter；返回当前结果 | 记录质量债 | 混合 | R072 | decision |
| D104 | server/src/services/novel/production/qualityClosure/ChapterQualityClosure.ts:200 | applyChapterQualityClosure：满足条件 !replanRecommendation?.recommended；进入条件分支 | 记录质量债 | 混合 | R072 | decision |
| D105 | server/src/services/novel/production/qualityClosure/ChapterQualityClosure.ts:201 | applyChapterQualityClosure：满足条件 !replanRecommendation?.recommended；返回当前结果 | 记录质量债 | 混合 | R072 | decision |
| D106 | server/src/services/novel/production/qualityClosure/ChapterQualityClosure.ts:203 | applyChapterQualityClosure：满足条件 replanRecommendation.affectedChapterOrders?.length；在两种结果之间选择 | 记录质量债 | 混合 | R072 | decision |
| D107 | server/src/services/novel/production/qualityClosure/ChapterQualityClosure.ts:206 | applyChapterQualityClosure：满足条件 replanRecommendation.scope === "global_book"；在两种结果之间选择 | 停止并重规划 | 混合 | R072 | decision |
| D108 | server/src/services/novel/production/qualityClosure/ChapterQualityClosure.ts:207 | applyChapterQualityClosure：满足条件 replanRecommendation.scope !== "global_book"；进入条件分支 | 停止并重规划 | 混合 | R072 | decision |
| D109 | server/src/services/novel/production/qualityClosure/ChapterQualityClosure.ts:218 | applyChapterQualityClosure：满足条件 !input.qualityAlertDetails.includes(completedDetail)；进入条件分支 | 记录质量债 | 混合 | R072 | decision |
| D110 | server/src/services/novel/production/qualityClosure/ChapterQualityClosure.ts:219 | applyChapterQualityClosure：满足条件 replanRecommendation.scope !== "global_book"；返回当前结果 | 停止并重规划 | 混合 | R072 | decision |
| D111 | server/src/services/novel/production/qualityClosure/ChapterQualityClosure.ts:221 | applyChapterQualityClosure：满足条件 error instanceof Error；在两种结果之间选择 | 记录质量债 | 混合 | R072 | decision |
| D112 | server/src/services/novel/production/qualityClosure/ChapterQualityClosure.ts:222 | applyChapterQualityClosure：满足条件 !input.recoverableRepairDetails.includes(failureDetail)；进入条件分支 | 记录质量债 | 混合 | R072 | decision |
| D113 | server/src/services/novel/production/qualityClosure/ChapterQualityClosure.ts:241 | applyChapterQualityClosure：满足条件 replanRecommendation.scope !== "global_book"；返回当前结果 | 停止并重规划 | 混合 | R072 | decision |
| D114 | server/src/services/novel/production/qualityClosure/ChapterQualityClosure.ts:244 | applyChapterQualityClosure：满足条件 replanRecommendation.action !== "stop_for_replan"；进入条件分支 | 停止并重规划 | 混合 | R072 | decision |
| D115 | server/src/services/novel/production/qualityClosure/ChapterQualityClosure.ts:245 | applyChapterQualityClosure：满足条件 !input.qualityAlertDetails.includes(detail)；进入条件分支 | 记录质量债 | 混合 | R072 | decision |
| D116 | server/src/services/novel/production/qualityClosure/ChapterQualityClosure.ts:246 | applyChapterQualityClosure：满足条件 replanRecommendation.action !== "stop_for_replan"；返回当前结果 | 停止并重规划 | 混合 | R072 | decision |
| D117 | server/src/services/novel/production/qualityClosure/ChapterQualityClosure.ts:266 | applyChapterQualityClosure：满足条件 !input.replanAlertDetails.includes(detail)；进入条件分支 | 记录质量债 | 混合 | R072 | decision |
| D118 | server/src/services/novel/production/qualityClosure/ChapterQualityClosure.ts:269 | applyChapterQualityClosure：满足条件 !input.replanAlertDetails.includes(detail)；进入条件分支 | 记录质量债 | 混合 | R072 | decision |
| D119 | server/src/services/novel/production/qualityClosure/ChapterQualityClosure.ts:270 | applyChapterQualityClosure：到达当前执行位置；返回当前结果 | 暂停等待人工 | 混合 | R072 | decision |
| D120 | server/src/services/novel/production/issueGovernance/PipelineIssueGovernance.ts:11 | resolvePipelineRuntimeIssueCode：满足条件 error && typeof error === "object" && "status" in error && error.status === 402；进入条件分支 | 其他：按冻结策略登记问题 | 调用方参数 | R014 | caller |
| D121 | server/src/services/novel/production/issueGovernance/PipelineIssueGovernance.ts:12 | resolvePipelineRuntimeIssueCode：满足条件 error && typeof error === "object" && "status" in error && error.status === 402；返回当前结果 | 其他：按冻结策略登记问题 | 调用方参数 | R014 | caller |
| D122 | server/src/services/novel/production/issueGovernance/PipelineIssueGovernance.ts:14 | resolvePipelineRuntimeIssueCode：到达当前执行位置；返回当前结果 | 其他：按冻结策略登记问题 | 调用方参数 | R014 | caller |
| D123 | server/src/services/novel/production/issueGovernance/PipelineIssueGovernance.ts:36 | reportPipelineIssue：满足条件 !input.governance；进入条件分支 | 其他：按冻结策略登记问题 | 调用方参数 | R014 | caller |
| D124 | server/src/services/novel/production/issueGovernance/PipelineIssueGovernance.ts:36 | reportPipelineIssue：满足条件 !input.governance；返回当前结果 | 其他：按冻结策略登记问题 | 调用方参数 | R014 | caller |
| D125 | server/src/services/novel/production/issueGovernance/PipelineIssueGovernance.ts:38 | reportPipelineIssue：到达当前执行位置；返回当前结果 | 其他：按冻结策略登记问题 | 调用方参数 | R014 | caller |
| D126 | server/src/services/novel/production/issueGovernance/PipelineIssueGovernance.ts:46 | reportPipelineIssue：满足条件 input.chapterId；在两种结果之间选择 | 其他：按冻结策略登记问题 | 调用方参数 | R014 | caller |
| D127 | server/src/services/novel/production/issueGovernance/PipelineIssueGovernance.ts:65 | reportPipelineIssue：满足条件 error instanceof Error；在两种结果之间选择 | 其他：按冻结策略登记问题 | 调用方参数 | R014 | caller |
| D128 | server/src/services/novel/production/issueGovernance/PipelineIssueGovernance.ts:67 | reportPipelineIssue：到达当前执行位置；抛出异常 | 失败 | 调用方参数 | R014 | caller |
| D129 | server/src/services/novel/production/NovelPipelineExecutor.ts:91 | clampPipelineMaxRetries：到达当前执行位置；返回当前结果 | 结束 | 调用方参数 | 无 | caller |
| D130 | server/src/services/novel/production/NovelPipelineExecutor.ts:95 | buildEmptyChapterDetail：到达当前执行位置；返回当前结果 | 结束 | 调用方参数 | 无 | caller |
| D131 | server/src/services/novel/production/NovelPipelineExecutor.ts:119 | ensurePipelineNotCancelled：满足条件 !job &#124;&#124; job.status === "cancelled" &#124;&#124; job.cancelRequestedAt；进入条件分支 | 其他：执行对应分支 | 持久化状态 | R186 | port:fence |
| D132 | server/src/services/novel/production/NovelPipelineExecutor.ts:120 | ensurePipelineNotCancelled：满足条件 !job &#124;&#124; job.status === "cancelled" &#124;&#124; job.cancelRequestedAt；抛出异常 | 其他：失权或取消，停止旧执行者写入 | 持久化状态 | R186 | port:fence |
| D133 | server/src/services/novel/production/NovelPipelineExecutor.ts:122 | ensurePipelineNotCancelled：满足条件 executionOwner && ( job.pendingManualRecovery &#124;&#124; job.executionOwner !== executionOwner &#124;&#124; !job.executionLeaseExpiresAt &#124;&#124; job.executionLeaseExpiresAt.getTime() <= Date.now() )；进入条件分支 | 暂停等待人工 | 持久化状态 | R186 | port:fence |
| D134 | server/src/services/novel/production/NovelPipelineExecutor.ts:131 | ensurePipelineNotCancelled：满足条件 executionOwner && ( job.pendingManualRecovery &#124;&#124; job.executionOwner !== executionOwner &#124;&#124; !job.executionLeaseExpiresAt &#124;&#124; job.executionLeaseExpiresAt.getTime() <= Date.now() )；抛出异常 | 其他：失权或取消，停止旧执行者写入 | 持久化状态 | R186 | port:fence |
| D135 | server/src/services/novel/production/NovelPipelineExecutor.ts:155 | updateJobSafe：满足条件 executionOwner；进入条件分支 | 其他：执行对应分支 | 持久化状态 | R186 | port:fence |
| D136 | server/src/services/novel/production/NovelPipelineExecutor.ts:161 | updateJobSafe：满足条件 writeMode === "runnable"；在两种结果之间选择 | 其他：执行对应分支 | 持久化状态 | R186 | port:fence |
| D137 | server/src/services/novel/production/NovelPipelineExecutor.ts:176 | updateJobSafe：满足条件 updated.count !== 1；进入条件分支 | 其他：执行对应分支 | 持久化状态 | R186 | port:fence |
| D138 | server/src/services/novel/production/NovelPipelineExecutor.ts:176 | updateJobSafe：满足条件 updated.count !== 1；抛出异常 | 其他：失权或取消，停止旧执行者写入 | 持久化状态 | R186 | port:fence |
| D139 | server/src/services/novel/production/NovelPipelineExecutor.ts:181 | updateJobSafe：满足条件 error instanceof PipelineExecutionLeaseLostError；进入条件分支 | 其他：执行对应分支 | 持久化状态 | R186 | port:fence |
| D140 | server/src/services/novel/production/NovelPipelineExecutor.ts:181 | updateJobSafe：满足条件 error instanceof PipelineExecutionLeaseLostError；抛出异常 | 失败 | 持久化状态 | R186 | port:fence |
| D141 | server/src/services/novel/production/NovelPipelineExecutor.ts:191 | updateJobRequired：满足条件 !executionOwner；进入条件分支 | 其他：执行对应分支 | 持久化状态 | R186 | port:fence |
| D142 | server/src/services/novel/production/NovelPipelineExecutor.ts:193 | updateJobRequired：满足条件 !executionOwner；返回当前结果 | 结束 | 持久化状态 | R186 | port:fence |
| D143 | server/src/services/novel/production/NovelPipelineExecutor.ts:206 | updateJobRequired：满足条件 updated.count !== 1；进入条件分支 | 其他：执行对应分支 | 持久化状态 | R186 | port:fence |
| D144 | server/src/services/novel/production/NovelPipelineExecutor.ts:206 | updateJobRequired：满足条件 updated.count !== 1；抛出异常 | 其他：失权或取消，停止旧执行者写入 | 持久化状态 | R186 | port:fence |
| D145 | server/src/services/novel/production/NovelPipelineExecutor.ts:210 | stringifyPipelinePayload：到达当前执行位置；返回当前结果 | 结束 | 调用方参数 | 无 | caller |
| D146 | server/src/services/novel/production/NovelPipelineExecutor.ts:214 | parsePipelinePayload：到达当前执行位置；返回当前结果 | 结束 | 调用方参数 | 无 | caller |
| D147 | server/src/services/novel/production/NovelPipelineExecutor.ts:218 | execute：到达当前执行位置；返回当前结果 | 结束 | 持久化状态 | R186 | port:fence |
| D148 | server/src/services/novel/production/NovelPipelineExecutor.ts:264 | executeWithOwnership：满足条件 runtimePayload.workflowTaskId；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D149 | server/src/services/novel/production/NovelPipelineExecutor.ts:276 | executeWithOwnership：满足条件 runtimePayload.issueGovernanceVersion === DIRECTOR_ISSUE_GOVERNANCE_VERSION && runtimePayload.issuePolicySnapshot；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D150 | server/src/services/novel/production/NovelPipelineExecutor.ts:286 | executeWithOwnership：满足条件 shouldRecordDirectorTelemetry；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D151 | server/src/services/novel/production/NovelPipelineExecutor.ts:321 | executeWithOwnership：满足条件 input.chapterOrder；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D152 | server/src/services/novel/production/NovelPipelineExecutor.ts:323 | executeWithOwnership：满足条件 decision.action === "auto_retry"；进入条件分支 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D153 | server/src/services/novel/production/NovelPipelineExecutor.ts:324 | executeWithOwnership：满足条件 !input.onRetry；进入条件分支 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D154 | server/src/services/novel/production/NovelPipelineExecutor.ts:325 | executeWithOwnership：满足条件 !input.onRetry；抛出异常 | 失败 | 调用方参数 | 无 | caller |
| D155 | server/src/services/novel/production/NovelPipelineExecutor.ts:328 | executeWithOwnership：满足条件 decision.action === "auto_retry"；返回当前结果 | 结束 | 调用方参数 | 无 | caller |
| D156 | server/src/services/novel/production/NovelPipelineExecutor.ts:336 | executeWithOwnership：满足条件 decision.action === "pause_for_manual"；进入条件分支 | 暂停等待人工 | 持久化状态 | R186 | port:fence |
| D157 | server/src/services/novel/production/NovelPipelineExecutor.ts:349 | executeWithOwnership：满足条件 decision.action === "pause_for_manual"；返回当前结果 | 暂停等待人工 | 调用方参数 | 无 | caller |
| D158 | server/src/services/novel/production/NovelPipelineExecutor.ts:365 | executeWithOwnership：到达当前执行位置；返回当前结果 | 结束 | 调用方参数 | 无 | caller |
| D159 | server/src/services/novel/production/NovelPipelineExecutor.ts:365 | executeWithOwnership：满足条件 result；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D160 | server/src/services/novel/production/NovelPipelineExecutor.ts:375 | executeWithOwnership：满足条件 shouldRecordDirectorTelemetry；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D161 | server/src/services/novel/production/NovelPipelineExecutor.ts:394 | executeWithOwnership：满足条件 options.startOrder > 1；进入条件分支 | 其他：执行对应分支 | 持久化状态 | R186 | port:fence |
| D162 | server/src/services/novel/production/NovelPipelineExecutor.ts:416 | executeWithOwnership：满足条件 edited；进入条件分支 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D163 | server/src/services/novel/production/NovelPipelineExecutor.ts:418 | executeWithOwnership：满足条件 !chapter.content?.trim() &#124;&#124; isCurrentV2ChapterProductionCompleted(chapter) &#124;&#124; (!edited && !terminal)；进入条件分支 | 其他：执行对应分支 | 调用方参数 | R025 | caller |
| D164 | server/src/services/novel/production/NovelPipelineExecutor.ts:424 | executeWithOwnership：满足条件 error instanceof PipelineExecutionLeaseLostError &#124;&#124; (error instanceof Error && error.message === "PIPELINE_CANCELLED")；进入条件分支 | 其他：执行对应分支 | 持久化状态 | R186 | port:fence |
| D165 | server/src/services/novel/production/NovelPipelineExecutor.ts:424 | executeWithOwnership：满足条件 error instanceof PipelineExecutionLeaseLostError &#124;&#124; (error instanceof Error && error.message === "PIPELINE_CANCELLED")；抛出异常 | 失败 | 持久化状态 | R186 | port:fence |
| D166 | server/src/services/novel/production/NovelPipelineExecutor.ts:425 | executeWithOwnership：满足条件 runtimePayload.directorNext && error instanceof ChapterArtifactSyncBoundaryError && error.result.characterReviewId；进入条件分支 | 其他：执行对应分支 | 持久化状态 | R186 | port:fence |
| D167 | server/src/services/novel/production/NovelPipelineExecutor.ts:429 | executeWithOwnership：满足条件 runtimePayload.directorNext && error instanceof ChapterArtifactSyncBoundaryError && error.result.characterReviewId；抛出异常 | 失败 | 调用方参数 | 无 | caller |
| D168 | server/src/services/novel/production/NovelPipelineExecutor.ts:431 | executeWithOwnership：到达当前执行位置；抛出异常 | 失败 | 调用方参数 | 无 | caller |
| D169 | server/src/services/novel/production/NovelPipelineExecutor.ts:431 | executeWithOwnership：满足条件 error instanceof Error；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D170 | server/src/services/novel/production/NovelPipelineExecutor.ts:440 | executeWithOwnership：满足条件 options.skipCompleted；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | R025 | caller |
| D171 | server/src/services/novel/production/NovelPipelineExecutor.ts:441 | executeWithOwnership：满足条件 runtimePayload.directorNext；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D172 | server/src/services/novel/production/NovelPipelineExecutor.ts:443 | executeWithOwnership：满足条件 !novel；进入条件分支 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D173 | server/src/services/novel/production/NovelPipelineExecutor.ts:444 | executeWithOwnership：满足条件 !novel；抛出异常 | 失败 | 调用方参数 | 无 | caller |
| D174 | server/src/services/novel/production/NovelPipelineExecutor.ts:456 | executeWithOwnership：满足条件 isAutopilotMode；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D175 | server/src/services/novel/production/NovelPipelineExecutor.ts:457 | executeWithOwnership：满足条件 runtimePayload.directorNext；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D176 | server/src/services/novel/production/NovelPipelineExecutor.ts:459 | executeWithOwnership：满足条件 runtimePayload.directorNext；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D177 | server/src/services/novel/production/NovelPipelineExecutor.ts:461 | executeWithOwnership：满足条件 isAutopilotMode；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D178 | server/src/services/novel/production/NovelPipelineExecutor.ts:464 | executeWithOwnership：满足条件 runtimePayload.directorNext && runtimePayload.skipCompleted；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | R025 | caller |
| D179 | server/src/services/novel/production/NovelPipelineExecutor.ts:467 | executeWithOwnership：满足条件 runtimePayload.skipCompleted；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | R025 | caller |
| D180 | server/src/services/novel/production/NovelPipelineExecutor.ts:476 | executeWithOwnership：满足条件 runtimePayload.directorNext；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D181 | server/src/services/novel/production/NovelPipelineExecutor.ts:480 | executeWithOwnership：满足条件 runtimePayload.directorNext；进入条件分支 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D182 | server/src/services/novel/production/NovelPipelineExecutor.ts:498 | executeWithOwnership：到达当前执行位置；抛出异常 | 失败 | 调用方参数 | 无 | caller |
| D183 | server/src/services/novel/production/NovelPipelineExecutor.ts:501 | executeWithOwnership：满足条件 cached；进入条件分支 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D184 | server/src/services/novel/production/NovelPipelineExecutor.ts:501 | executeWithOwnership：满足条件 cached；返回当前结果 | 结束 | 调用方参数 | 无 | caller |
| D185 | server/src/services/novel/production/NovelPipelineExecutor.ts:509 | executeWithOwnership：满足条件 !prepared；进入条件分支 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D186 | server/src/services/novel/production/NovelPipelineExecutor.ts:510 | executeWithOwnership：满足条件 !prepared；抛出异常 | 失败 | 调用方参数 | 无 | caller |
| D187 | server/src/services/novel/production/NovelPipelineExecutor.ts:513 | executeWithOwnership：到达当前执行位置；返回当前结果 | 结束 | 调用方参数 | 无 | caller |
| D188 | server/src/services/novel/production/NovelPipelineExecutor.ts:515 | executeWithOwnership：满足条件 isAutopilotMode && runtimePayload.directorNext；进入条件分支 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D189 | server/src/services/novel/production/NovelPipelineExecutor.ts:518 | executeWithOwnership：满足条件 nextOrder <= autopilotTargetEndOrder && chaptersToProcess[0]?.order !== nextOrder；进入条件分支 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D190 | server/src/services/novel/production/NovelPipelineExecutor.ts:522 | executeWithOwnership：满足条件 isAutopilotMode；进入条件分支 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D191 | server/src/services/novel/production/NovelPipelineExecutor.ts:537 | executeWithOwnership：满足条件 recoveringSavedQuality；进入条件分支 | 其他：执行对应分支 | 持久化状态 | R146 | port:budget |
| D192 | server/src/services/novel/production/NovelPipelineExecutor.ts:539 | executeWithOwnership：满足条件 savedUsage?.endJobTokens !== undefined；进入条件分支 | 其他：执行对应分支 | 持久化状态 | R146 | port:budget |
| D193 | server/src/services/novel/production/NovelPipelineExecutor.ts:540 | executeWithOwnership：满足条件 savedUsage.chapterOrder !== chapter.order；进入条件分支 | 其他：执行对应分支 | 持久化状态 | R146 | port:budget |
| D194 | server/src/services/novel/production/NovelPipelineExecutor.ts:540 | executeWithOwnership：满足条件 savedUsage.chapterOrder !== chapter.order；抛出异常 | 失败 | 持久化状态 | R146 | port:budget |
| D195 | server/src/services/novel/production/NovelPipelineExecutor.ts:546 | executeWithOwnership：满足条件 recoveringSavedQuality；抛出异常 | 失败 | 调用方参数 | R025 | caller |
| D196 | server/src/services/novel/production/NovelPipelineExecutor.ts:546 | executeWithOwnership：满足条件 error instanceof Error；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D197 | server/src/services/novel/production/NovelPipelineExecutor.ts:547 | executeWithOwnership：满足条件 error instanceof SavedChapterQualityRecoveryError；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D198 | server/src/services/novel/production/NovelPipelineExecutor.ts:553 | executeWithOwnership：满足条件 !runtimePayload.directorNext；进入条件分支 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D199 | server/src/services/novel/production/NovelPipelineExecutor.ts:553 | executeWithOwnership：满足条件 !runtimePayload.directorNext；返回当前结果 | 结束 | 调用方参数 | 无 | caller |
| D200 | server/src/services/novel/production/NovelPipelineExecutor.ts:559 | executeWithOwnership：满足条件 closed；在两种结果之间选择 | 其他：执行对应分支 | 持久化状态 | R146 | port:budget |
| D201 | server/src/services/novel/production/NovelPipelineExecutor.ts:563 | executeWithOwnership：到达当前执行位置；抛出异常 | 失败 | 调用方参数 | 无 | caller |
| D202 | server/src/services/novel/production/NovelPipelineExecutor.ts:563 | executeWithOwnership：满足条件 error instanceof Error；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D203 | server/src/services/novel/production/NovelPipelineExecutor.ts:569 | executeWithOwnership：满足条件 initialized &#124;&#124; closed &#124;&#124; paused；进入条件分支 | 其他：执行对应分支 | 持久化状态 | R186 | port:fence |
| D204 | server/src/services/novel/production/NovelPipelineExecutor.ts:572 | executeWithOwnership：满足条件 closed；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D205 | server/src/services/novel/production/NovelPipelineExecutor.ts:576 | executeWithOwnership：满足条件 error instanceof PipelineExecutionLeaseLostError；进入条件分支 | 其他：执行对应分支 | 持久化状态 | R186 | port:fence |
| D206 | server/src/services/novel/production/NovelPipelineExecutor.ts:576 | executeWithOwnership：满足条件 error instanceof PipelineExecutionLeaseLostError；抛出异常 | 失败 | 持久化状态 | R186 | port:fence |
| D207 | server/src/services/novel/production/NovelPipelineExecutor.ts:577 | executeWithOwnership：满足条件 initialized &#124;&#124; closed &#124;&#124; paused；抛出异常 | 失败 | 调用方参数 | 无 | caller |
| D208 | server/src/services/novel/production/NovelPipelineExecutor.ts:581 | executeWithOwnership：满足条件 paused；进入条件分支 | 其他：执行对应分支 | 持久化状态 | R146 | port:budget |
| D209 | server/src/services/novel/production/NovelPipelineExecutor.ts:583 | executeWithOwnership：满足条件 budget.metric === "uncached_tokens_v1"；在两种结果之间选择 | 其他：执行对应分支 | 持久化状态 | R146 | port:budget |
| D210 | server/src/services/novel/production/NovelPipelineExecutor.ts:584 | executeWithOwnership：满足条件 observed.exceeded；在两种结果之间选择 | 其他：执行对应分支 | 持久化状态 | R146 | port:budget |
| D211 | server/src/services/novel/production/NovelPipelineExecutor.ts:585 | executeWithOwnership：满足条件 closed；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D212 | server/src/services/novel/production/NovelPipelineExecutor.ts:586 | executeWithOwnership：满足条件 closed；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D213 | server/src/services/novel/production/NovelPipelineExecutor.ts:587 | executeWithOwnership：满足条件 paused；抛出异常 | 失败 | 持久化状态 | R146 | port:budget |
| D214 | server/src/services/novel/production/NovelPipelineExecutor.ts:591 | executeWithOwnership：满足条件 !recoveringSavedQuality；进入条件分支 | 其他：执行对应分支 | 持久化状态 | R146 | port:budget |
| D215 | server/src/services/novel/production/NovelPipelineExecutor.ts:617 | executeWithOwnership：满足条件 recoveringSavedQuality；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | R025 | caller |
| D216 | server/src/services/novel/production/NovelPipelineExecutor.ts:646 | executeWithOwnership：满足条件 chapterRetryCountUsed >= chapterRetryBudget；进入条件分支 | 其他：执行对应分支 | 持久化状态 | R146 | port:budget |
| D217 | server/src/services/novel/production/NovelPipelineExecutor.ts:646 | executeWithOwnership：满足条件 chapterRetryCountUsed >= chapterRetryBudget；返回当前结果 | 结束 | 持久化状态 | R146 | port:budget |
| D218 | server/src/services/novel/production/NovelPipelineExecutor.ts:649 | executeWithOwnership：满足条件 claimed；进入条件分支 | 其他：执行对应分支 | 持久化状态 | R146 | port:budget |
| D219 | server/src/services/novel/production/NovelPipelineExecutor.ts:652 | executeWithOwnership：到达当前执行位置；返回当前结果 | 结束 | 调用方参数 | 无 | caller |
| D220 | server/src/services/novel/production/NovelPipelineExecutor.ts:680 | executeWithOwnership：满足条件 runtimePayload.directorNext；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D221 | server/src/services/novel/production/NovelPipelineExecutor.ts:707 | executeWithOwnership：满足条件 willRetry；进入条件分支 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D222 | server/src/services/novel/production/NovelPipelineExecutor.ts:709 | executeWithOwnership：满足条件 willRetry；返回当前结果 | 结束 | 调用方参数 | 无 | caller |
| D223 | server/src/services/novel/production/NovelPipelineExecutor.ts:711 | executeWithOwnership：满足条件 !qualityAlertDetails.includes(detail)；进入条件分支 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D224 | server/src/services/novel/production/NovelPipelineExecutor.ts:718 | executeWithOwnership：到达当前执行位置；结束当前循环 | 结束 | 调用方参数 | 无 | caller |
| D225 | server/src/services/novel/production/NovelPipelineExecutor.ts:720 | executeWithOwnership：满足条件 error instanceof ReviewRetryPersistenceError；进入条件分支 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D226 | server/src/services/novel/production/NovelPipelineExecutor.ts:721 | executeWithOwnership：满足条件 error instanceof ReviewRetryPersistenceError；抛出异常 | 失败 | 调用方参数 | 无 | caller |
| D227 | server/src/services/novel/production/NovelPipelineExecutor.ts:723 | executeWithOwnership：满足条件 runtimePayload.directorNext && error instanceof ChapterArtifactSyncBoundaryError && error.result.characterReviewId；进入条件分支 | 其他：执行对应分支 | 持久化状态 | R186 | port:fence |
| D228 | server/src/services/novel/production/NovelPipelineExecutor.ts:728 | executeWithOwnership：满足条件 runtimePayload.directorNext && error instanceof ChapterArtifactSyncBoundaryError && error.result.characterReviewId；抛出异常 | 失败 | 调用方参数 | 无 | caller |
| D229 | server/src/services/novel/production/NovelPipelineExecutor.ts:730 | executeWithOwnership：满足条件 runtimePayload.directorNext && error instanceof ChapterArtifactSyncBoundaryError；进入条件分支 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D230 | server/src/services/novel/production/NovelPipelineExecutor.ts:731 | executeWithOwnership：满足条件 runtimePayload.directorNext && error instanceof ChapterArtifactSyncBoundaryError；抛出异常 | 失败 | 调用方参数 | 无 | caller |
| D231 | server/src/services/novel/production/NovelPipelineExecutor.ts:733 | executeWithOwnership：满足条件 error instanceof PipelineIssueFailure && error.stage === "chapter_usage"；进入条件分支 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D232 | server/src/services/novel/production/NovelPipelineExecutor.ts:733 | executeWithOwnership：满足条件 error instanceof PipelineIssueFailure && error.stage === "chapter_usage"；抛出异常 | 失败 | 调用方参数 | 无 | caller |
| D233 | server/src/services/novel/production/NovelPipelineExecutor.ts:734 | executeWithOwnership：满足条件 error instanceof PipelineExecutionLeaseLostError；进入条件分支 | 其他：执行对应分支 | 持久化状态 | R186 | port:fence |
| D234 | server/src/services/novel/production/NovelPipelineExecutor.ts:735 | executeWithOwnership：满足条件 error instanceof PipelineExecutionLeaseLostError；抛出异常 | 失败 | 持久化状态 | R186 | port:fence |
| D235 | server/src/services/novel/production/NovelPipelineExecutor.ts:737 | executeWithOwnership：满足条件 error instanceof Error && error.message === "PIPELINE_CANCELLED"；进入条件分支 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D236 | server/src/services/novel/production/NovelPipelineExecutor.ts:738 | executeWithOwnership：满足条件 error instanceof Error && error.message === "PIPELINE_CANCELLED"；抛出异常 | 失败 | 调用方参数 | 无 | caller |
| D237 | server/src/services/novel/production/NovelPipelineExecutor.ts:740 | executeWithOwnership：满足条件 error instanceof Error；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D238 | server/src/services/novel/production/NovelPipelineExecutor.ts:745 | executeWithOwnership：满足条件 error instanceof ChapterContentPersistenceError；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D239 | server/src/services/novel/production/NovelPipelineExecutor.ts:747 | executeWithOwnership：满足条件 isChapterEmptyContentError(error)；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D240 | server/src/services/novel/production/NovelPipelineExecutor.ts:750 | executeWithOwnership：满足条件 error instanceof ChapterContentPersistenceError；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D241 | server/src/services/novel/production/NovelPipelineExecutor.ts:753 | executeWithOwnership：满足条件 error instanceof ChapterContentPersistenceError；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D242 | server/src/services/novel/production/NovelPipelineExecutor.ts:756 | executeWithOwnership：满足条件 error instanceof Error；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D243 | server/src/services/novel/production/NovelPipelineExecutor.ts:759 | executeWithOwnership：满足条件 canOfferGovernedRetry；在两种结果之间选择 | 其他：执行对应分支 | 持久化状态 | R146 | port:budget |
| D244 | server/src/services/novel/production/NovelPipelineExecutor.ts:762 | executeWithOwnership：满足条件 canOfferGovernedRetry；在两种结果之间选择 | 其他：执行对应分支 | 持久化状态 | R146 | port:budget |
| D245 | server/src/services/novel/production/NovelPipelineExecutor.ts:764 | executeWithOwnership：满足条件 !(await claimAttempt("runtime_retry"))；进入条件分支 | 其他：执行对应分支 | 持久化状态 | R146 | port:budget |
| D246 | server/src/services/novel/production/NovelPipelineExecutor.ts:765 | executeWithOwnership：满足条件 !(await claimAttempt("runtime_retry"))；抛出异常 | 失败 | 持久化状态 | R146 | port:budget |
| D247 | server/src/services/novel/production/NovelPipelineExecutor.ts:777 | executeWithOwnership：满足条件 action && action !== "auto_retry"；进入条件分支 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D248 | server/src/services/novel/production/NovelPipelineExecutor.ts:778 | executeWithOwnership：满足条件 action && action !== "auto_retry"；抛出异常 | 失败 | 调用方参数 | 无 | caller |
| D249 | server/src/services/novel/production/NovelPipelineExecutor.ts:787 | executeWithOwnership：满足条件 !canRetry；进入条件分支 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D250 | server/src/services/novel/production/NovelPipelineExecutor.ts:788 | executeWithOwnership：满足条件 !canRetry；抛出异常 | 失败 | 调用方参数 | 无 | caller |
| D251 | server/src/services/novel/production/NovelPipelineExecutor.ts:790 | executeWithOwnership：满足条件 !action；进入条件分支 | 其他：执行对应分支 | 持久化状态 | R146 | port:budget |
| D252 | server/src/services/novel/production/NovelPipelineExecutor.ts:791 | executeWithOwnership：满足条件 !(await claimAttempt("runtime_retry"))；进入条件分支 | 其他：执行对应分支 | 持久化状态 | R146 | port:budget |
| D253 | server/src/services/novel/production/NovelPipelineExecutor.ts:791 | executeWithOwnership：满足条件 !(await claimAttempt("runtime_retry"))；抛出异常 | 失败 | 持久化状态 | R146 | port:budget |
| D254 | server/src/services/novel/production/NovelPipelineExecutor.ts:794 | executeWithOwnership：满足条件 !action；进入条件分支 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D255 | server/src/services/novel/production/NovelPipelineExecutor.ts:808 | executeWithOwnership：满足条件 error instanceof Error；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D256 | server/src/services/novel/production/NovelPipelineExecutor.ts:815 | executeWithOwnership：满足条件 !chapterResult；进入条件分支 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D257 | server/src/services/novel/production/NovelPipelineExecutor.ts:816 | executeWithOwnership：满足条件 !chapterResult；抛出异常 | 失败 | 调用方参数 | 无 | caller |
| D258 | server/src/services/novel/production/NovelPipelineExecutor.ts:842 | executeWithOwnership：满足条件 recoveringSavedQuality；在两种结果之间选择 | 其他：执行对应分支 | 持久化状态 | R146 | port:budget |
| D259 | server/src/services/novel/production/NovelPipelineExecutor.ts:848 | executeWithOwnership：满足条件 !shouldStopAfterCurrentChapter && isAutopilotMode && chapter.order < autopilotTargetEndOrder；进入条件分支 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D260 | server/src/services/novel/production/NovelPipelineExecutor.ts:850 | executeWithOwnership：满足条件 runtimePayload.skipCompleted；进入条件分支 | 其他：执行对应分支 | 调用方参数 | R025 | caller |
| D261 | server/src/services/novel/production/NovelPipelineExecutor.ts:851 | executeWithOwnership：满足条件 nextOrder <= autopilotTargetEndOrder；进入条件分支 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D262 | server/src/services/novel/production/NovelPipelineExecutor.ts:853 | executeWithOwnership：满足条件 cached?.order === nextOrder；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D263 | server/src/services/novel/production/NovelPipelineExecutor.ts:854 | executeWithOwnership：满足条件 cached?.order !== prepared.order；进入条件分支 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D264 | server/src/services/novel/production/NovelPipelineExecutor.ts:880 | executeWithOwnership：满足条件 chapterStopAction === "fail_task"；进入条件分支 | 其他：执行对应分支 | 持久化状态 | R186 | port:fence |
| D265 | server/src/services/novel/production/NovelPipelineExecutor.ts:899 | executeWithOwnership：满足条件 chapterStopAction === "fail_task"；抛出异常 | 失败 | 调用方参数 | 无 | caller |
| D266 | server/src/services/novel/production/NovelPipelineExecutor.ts:901 | executeWithOwnership：满足条件 shouldStopAfterCurrentChapter；进入条件分支 | 其他：执行对应分支 | 持久化状态 | R186 | port:fence |
| D267 | server/src/services/novel/production/NovelPipelineExecutor.ts:903 | executeWithOwnership：满足条件 chapterResult.reviewRetries?.exhausted；进入条件分支 | 其他：执行对应分支 | 持久化状态 | R186 | port:fence |
| D268 | server/src/services/novel/production/NovelPipelineExecutor.ts:909 | executeWithOwnership：满足条件 shouldStopAfterCurrentChapter；结束当前循环 | 结束 | 调用方参数 | 无 | caller |
| D269 | server/src/services/novel/production/NovelPipelineExecutor.ts:913 | executeWithOwnership：满足条件 pendingManualRecovery；进入条件分支 | 暂停等待人工 | 持久化状态 | R186 | port:fence |
| D270 | server/src/services/novel/production/NovelPipelineExecutor.ts:931 | executeWithOwnership：满足条件 pendingManualRecovery；返回当前结果 | 暂停等待人工 | 持久化状态 | R186 | port:fence |
| D271 | server/src/services/novel/production/NovelPipelineExecutor.ts:974 | executeWithOwnership：满足条件 error instanceof PipelineExecutionLeaseLostError；进入条件分支 | 其他：执行对应分支 | 持久化状态 | R186 | port:fence |
| D272 | server/src/services/novel/production/NovelPipelineExecutor.ts:976 | executeWithOwnership：满足条件 error instanceof PipelineExecutionLeaseLostError；返回当前结果 | 结束 | 持久化状态 | R186 | port:fence |
| D273 | server/src/services/novel/production/NovelPipelineExecutor.ts:978 | executeWithOwnership：满足条件 error instanceof PipelineIssueAppliedError；进入条件分支 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D274 | server/src/services/novel/production/NovelPipelineExecutor.ts:979 | executeWithOwnership：满足条件 runtimePayload.directorNext?.pendingCharacterReviewId；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D275 | server/src/services/novel/production/NovelPipelineExecutor.ts:980 | executeWithOwnership：满足条件 runtimePayload.directorNext?.pendingCharacterReviewId；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D276 | server/src/services/novel/production/NovelPipelineExecutor.ts:986 | executeWithOwnership：满足条件 error.action === "fail_task"；进入条件分支 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D277 | server/src/services/novel/production/NovelPipelineExecutor.ts:992 | executeWithOwnership：满足条件 error instanceof PipelineIssueAppliedError；返回当前结果 | 结束 | 调用方参数 | 无 | caller |
| D278 | server/src/services/novel/production/NovelPipelineExecutor.ts:994 | executeWithOwnership：满足条件 error instanceof Error && error.message === "PIPELINE_CANCELLED"；进入条件分支 | 其他：执行对应分支 | 持久化状态 | R186 | port:fence |
| D279 | server/src/services/novel/production/NovelPipelineExecutor.ts:1014 | executeWithOwnership：满足条件 error instanceof Error && error.message === "PIPELINE_CANCELLED"；返回当前结果 | 结束 | 调用方参数 | 无 | caller |
| D280 | server/src/services/novel/production/NovelPipelineExecutor.ts:1017 | executeWithOwnership：满足条件 runtimePayload.directorNext && error instanceof ChapterArtifactSyncBoundaryError && error.result.characterReviewId；进入条件分支 | 其他：执行对应分支 | 持久化状态 | R186 | port:fence |
| D281 | server/src/services/novel/production/NovelPipelineExecutor.ts:1021 | executeWithOwnership：满足条件 runtimePayload.directorNext && error instanceof ChapterArtifactSyncBoundaryError && error.result.characterReviewId；返回当前结果 | 结束 | 调用方参数 | 无 | caller |
| D282 | server/src/services/novel/production/NovelPipelineExecutor.ts:1023 | executeWithOwnership：满足条件 error instanceof Error；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D283 | server/src/services/novel/production/NovelPipelineExecutor.ts:1024 | executeWithOwnership：满足条件 isChapterEmptyContentError(error)；进入条件分支 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D284 | server/src/services/novel/production/NovelPipelineExecutor.ts:1038 | executeWithOwnership：满足条件 error instanceof PipelineIssueFailure；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D285 | server/src/services/novel/production/NovelPipelineExecutor.ts:1040 | executeWithOwnership：满足条件 error instanceof ChapterArtifactSyncBoundaryError；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D286 | server/src/services/novel/production/NovelPipelineExecutor.ts:1042 | executeWithOwnership：满足条件 error instanceof ChapterContentPersistenceError；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D287 | server/src/services/novel/production/NovelPipelineExecutor.ts:1044 | executeWithOwnership：满足条件 isChapterEmptyContentError(error)；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D288 | server/src/services/novel/production/NovelPipelineExecutor.ts:1047 | executeWithOwnership：满足条件 error instanceof PipelineIssueFailure；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D289 | server/src/services/novel/production/NovelPipelineExecutor.ts:1049 | executeWithOwnership：满足条件 error instanceof ChapterContentPersistenceError；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D290 | server/src/services/novel/production/NovelPipelineExecutor.ts:1053 | executeWithOwnership：满足条件 error instanceof Error；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D291 | server/src/services/novel/production/NovelPipelineExecutor.ts:1054 | executeWithOwnership：满足条件 error instanceof PipelineIssueFailure；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D292 | server/src/services/novel/production/NovelPipelineExecutor.ts:1055 | executeWithOwnership：满足条件 error instanceof PipelineIssueFailure；在两种结果之间选择 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D293 | server/src/services/novel/production/NovelPipelineExecutor.ts:1058 | executeWithOwnership：满足条件 governedAction；进入条件分支 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D294 | server/src/services/novel/production/NovelPipelineExecutor.ts:1065 | executeWithOwnership：满足条件 governedAction === "fail_task"；进入条件分支 | 其他：执行对应分支 | 调用方参数 | 无 | caller |
| D295 | server/src/services/novel/production/NovelPipelineExecutor.ts:1071 | executeWithOwnership：满足条件 governedAction；返回当前结果 | 结束 | 调用方参数 | 无 | caller |
