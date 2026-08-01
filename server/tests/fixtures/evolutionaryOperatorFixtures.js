const mockCandidateA = {
  id: "cand_001_action",
  title: "第三章 绝地反击 (方案A)",
  content: `林辰一挥长剑，剑气如虹，撕裂了黑衣刺客的防御。暗影刺客倒退三步，口吐鲜血。林辰冷声道：“你的刺杀到此为止了！”说罢，他身形一闪，化作残影，一招‘飞仙剑诀’径直刺向敌人要害。然而黑衣人冷笑一声，引爆了手中的烟雾弹，瞬间消失在林柱之中。`,
  summary: "林辰击退黑衣人，黑衣人借烟雾逃脱。",
  outlineId: "outline_001",
  chapterId: "chap_003",
  metadata: { focus: "action_pacing" },
};

const mockCandidateB = {
  id: "cand_002_emotion",
  title: "第三章 绝地反击 (方案B)",
  content: `月光被浓重的黑云遮蔽，森林中弥漫着腥臭的血腥味。林辰按住胸口的伤口，剧烈的疼痛让他呼吸急促。他看着眼前的黑衣人，脑海中浮现出师父临终前的告诫：“剑者，心不可乱。”他深吸一口气，强行镇定下来，缓缓拔出佩剑。黑衣人眼中闪过一丝忌惮，警惕地向后退去。`,
  summary: "林辰在逆境中回忆师训，克服恐惧镇定拔剑。",
  outlineId: "outline_001",
  chapterId: "chap_003",
  metadata: { focus: "character_emotion" },
};

const mockAuditDiagnostics = {
  issues: [
    { severity: 'medium', description: '字数偏短，打斗过程缺乏细节描写。', fixSuggestion: '增加招式对决细节与环境互动。' },
    { severity: 'low', description: '结尾过于仓促。', fixSuggestion: '补充黑衣人逃跑后的环境收尾。' }
  ],
  triggerReasons: ['length_short', 'abrupt_ending']
};

const mockConstraintViolations = {
  issues: [
    { severity: 'critical', description: '角色林辰提前使用了尚未习得的‘飞仙剑诀’，违反设定集。', fixSuggestion: '替换为基础剑法‘青云十三式’。' }
  ],
  triggerReasons: ['bible_rule_breach']
};

module.exports = {
  mockCandidateA,
  mockCandidateB,
  mockAuditDiagnostics,
  mockConstraintViolations,
};
