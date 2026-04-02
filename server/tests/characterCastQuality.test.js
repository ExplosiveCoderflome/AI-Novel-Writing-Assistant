const test = require("node:test");
const assert = require("node:assert/strict");

const {
  assessCharacterCastBatch,
  buildCharacterCastBlockedMessage,
} = require("../dist/services/novel/characterPrep/characterCastQuality.js");

test("character cast quality gate blocks abstract slot names and missing hidden identity anchors", () => {
  const storyInput = "打工人刘雪婷穿越到秦朝成为太监，最后发现自己竟然就是赵高。";
  const assessment = assessCharacterCastBatch([
    {
      id: "option_bad",
      title: "功能位拼装版",
      summary: "主角被卷入秦朝宫廷谜局。",
      whyItWorks: "有冲突。",
      recommendedReason: "快。",
      members: [
        {
          name: "谜团催化剂",
          role: "主角",
          gender: "unknown",
          castRole: "protagonist",
          relationToProtagonist: "主角本人",
          storyFunction: "推动身份谜团揭示",
          shortDescription: "现代人误入宫廷",
          outerGoal: "活下来",
          innerNeed: "确认自我",
          fear: "被识破",
          wound: "失去原人生",
          misbelief: "只要苟住就能活",
          secret: "",
          moralLine: "不滥杀无辜",
          firstImpression: "惶恐又嘴硬",
        },
        {
          name: "知识导师位",
          role: "导师",
          gender: "male",
          castRole: "mentor",
          relationToProtagonist: "引路人",
          storyFunction: "解释制度",
          shortDescription: "宫里老人",
          outerGoal: "自保",
          innerNeed: "找接班人",
          fear: "卷入大案",
          wound: "",
          misbelief: "",
          secret: "",
          moralLine: "",
          firstImpression: "",
        },
        {
          name: "外部威胁位",
          role: "对手",
          gender: "male",
          castRole: "pressure_source",
          relationToProtagonist: "追杀者",
          storyFunction: "施压",
          shortDescription: "宫廷高压来源",
          outerGoal: "灭口",
          innerNeed: "",
          fear: "",
          wound: "",
          misbelief: "",
          secret: "",
          moralLine: "",
          firstImpression: "",
        },
      ],
      relations: [
        {
          sourceName: "谜团催化剂",
          targetName: "知识导师位",
          surfaceRelation: "试探合作",
          hiddenTension: "互不信任",
          conflictSource: "都想先自保",
          secretAsymmetry: "",
          dynamicLabel: "试探",
          nextTurnPoint: "导师准备弃子",
        },
        {
          sourceName: "谜团催化剂",
          targetName: "外部威胁位",
          surfaceRelation: "猫鼠",
          hiddenTension: "",
          conflictSource: "身份暴露风险",
          secretAsymmetry: "",
          dynamicLabel: "追猎",
          nextTurnPoint: "对方逼近真相",
        },
      ],
    },
  ], storyInput);

  assert.equal(assessment.autoApplicableOptionIndex, null);
  const issueCodes = assessment.options[0].issues.map((issue) => issue.code);
  assert.ok(issueCodes.includes("abstract_name"));
  assert.ok(issueCodes.includes("missing_hidden_identity_anchor"));
  assert.match(buildCharacterCastBlockedMessage(assessment), /不能直接应用到正式角色库/);
});

test("character cast quality gate accepts concrete cast that carries identity anchors and gender", () => {
  const storyInput = "打工人刘雪婷穿越到秦朝成为太监，最后发现自己竟然就是赵高。";
  const assessment = assessCharacterCastBatch([
    {
      id: "option_good",
      title: "宫廷身份反转版",
      summary: "刘雪婷以秦宫内廷太监身份求生，在赵高命运线上越走越深。",
      whyItWorks: "人物身份、制度压力和终局真相能被同一套阵容承接。",
      recommendedReason: "更适合长篇宫廷权谋推进。",
      members: [
        {
          name: "刘雪婷",
          role: "现代穿越者 / 内廷太监",
          gender: "female",
          castRole: "protagonist",
          relationToProtagonist: "主角本人",
          storyFunction: "在求生与权谋里逐步逼近赵高真相",
          shortDescription: "披着太监身份在秦朝内廷求生的现代打工人",
          outerGoal: "先在秦宫活下去",
          innerNeed: "确认自己为何与赵高命运重叠",
          fear: "被宫廷权力碾碎",
          wound: "失去原本人生",
          misbelief: "只要躲着权力就能保命",
          secret: "她与赵高这条命运线存在重叠",
          moralLine: "不愿为了活命伤害无辜",
          firstImpression: "谨慎、能忍、脑子快",
        },
        {
          name: "中车府令赵成",
          role: "宫廷前辈",
          gender: "male",
          castRole: "mentor",
          relationToProtagonist: "半引路半试探",
          storyFunction: "带主角看见内廷生存规则与权力链",
          shortDescription: "熟悉秦宫内廷暗规的老资格宦者",
          outerGoal: "守住自己在内廷的位置",
          innerNeed: "找到能延续布局的人",
          fear: "被更上层的人清洗",
          wound: "",
          misbelief: "",
          secret: "知道部分赵高旧事",
          moralLine: "",
          firstImpression: "老辣克制",
        },
        {
          name: "胡亥",
          role: "皇子",
          gender: "male",
          castRole: "pressure_source",
          relationToProtagonist: "随时可能碾死她的权力对象",
          storyFunction: "持续制造制度压力和生死风险",
          shortDescription: "被内廷与权术包围的危险皇子",
          outerGoal: "稳住继承局面",
          innerNeed: "",
          fear: "",
          wound: "",
          misbelief: "",
          secret: "",
          moralLine: "",
          firstImpression: "阴晴难测",
        },
      ],
      relations: [
        {
          sourceName: "刘雪婷",
          targetName: "中车府令赵成",
          surfaceRelation: "求生师徒",
          hiddenTension: "双方都在互相利用",
          conflictSource: "谁先交出底牌",
          secretAsymmetry: "赵成知道更多赵高旧事",
          dynamicLabel: "试探结盟",
          nextTurnPoint: "赵成决定是否押注刘雪婷",
        },
        {
          sourceName: "刘雪婷",
          targetName: "胡亥",
          surfaceRelation: "上位者与近侍",
          hiddenTension: "她越靠近胡亥，越接近赵高命运",
          conflictSource: "近身侍奉带来的高压风险",
          secretAsymmetry: "",
          dynamicLabel: "高压依附",
          nextTurnPoint: "刘雪婷第一次因胡亥卷入大案",
        },
      ],
    },
  ], storyInput);

  assert.equal(assessment.autoApplicableOptionIndex, 0);
  assert.equal(assessment.options[0].issues.length, 0);
});
