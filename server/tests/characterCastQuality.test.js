const test = require("node:test");
const assert = require("node:assert/strict");

const {
  assessCharacterCastBatch,
  buildCharacterCastBlockedMessage,
} = require("../dist/services/novel/characterPrep/characterCastQuality.js");
const {
  characterCastOptionResponseSchema,
} = require("../dist/prompting/prompts/novel/characterPreparation.promptSchemas.js");

test("core character cast schema preserves full profile and hard facts", () => {
  const parsed = characterCastOptionResponseSchema.parse({
    options: [
      {
        title: "封神逆转阵容",
        summary: "申公豹重生后重组关键人物关系。",
        whyItWorks: "主角身份和阵营约束可直接进入正文。",
        recommendedReason: "能避免阵营和境界写错。",
        members: [
          {
            name: "申公豹",
            role: "玉虚宫门下 / 逆向布局者",
            gender: "male",
            castRole: "protagonist",
            relationToProtagonist: "主角本人",
            storyFunction: "策反封神关键人物，逆转天命",
            shortDescription: "带着前世记忆重开封神局的人",
            personality: "隐忍、善辩，遇到关键人物会先试探再押注",
            background: "元始天尊门下，前世被封神大势裹挟。",
            development: "从被动说客转为主动布局者。",
            identityLabel: "玉虚宫门下申公豹",
            factionLabel: "阐教",
            stanceLabel: "反天命布局",
            powerLevel: "阐教门人",
            realm: "仙道修行者",
            currentLocation: "昆仑附近",
            availability: "本章可行动",
            prohibitions: ["不得自称截教外门弟子"],
            outerGoal: "策反赵公明",
            innerNeed: "摆脱被天命利用的宿命",
            fear: "再次被封神大势吞没",
            wound: "前世失败记忆",
            misbelief: "只靠口舌就能扭转大势",
            secret: "保留前世记忆",
            moralLine: "不再把同道送入死局",
            firstImpression: "笑意克制，话里藏锋",
          },
          {
            name: "赵公明",
            role: "截教高手",
            gender: "male",
            castRole: "ally",
            relationToProtagonist: "被策反对象",
            storyFunction: "承接第一条信任与反杀线",
            personality: "豪迈但警惕",
            background: "峨眉罗浮洞修行的截教重要人物。",
            development: "从不信申公豹到初步信任。",
            identityLabel: "截教外门强者",
            factionLabel: "截教",
            powerLevel: "大罗金仙",
            realm: "大罗金仙",
            prohibitions: ["不得写成真仙后期"],
          },
          {
            name: "元始天尊",
            role: "阐教掌教",
            gender: "male",
            castRole: "pressure_source",
            relationToProtagonist: "师尊与上位压力源",
            storyFunction: "制造阵营压力和天命约束",
            personality: "威严冷峻",
            background: "阐教掌教，封神大势的关键执棋者。",
            development: "逐渐察觉申公豹偏离原本轨迹。",
            identityLabel: "阐教掌教",
            factionLabel: "阐教",
            powerLevel: "圣人",
            realm: "圣人",
          },
        ],
        relations: [
          {
            sourceName: "申公豹",
            targetName: "赵公明",
            surfaceRelation: "试探结盟",
            hiddenTension: "阵营不同导致互不信任",
            conflictSource: "申公豹知道死局但难以解释来源",
          },
          {
            sourceName: "申公豹",
            targetName: "元始天尊",
            surfaceRelation: "师徒",
            hiddenTension: "申公豹正在背离阐教安排",
            conflictSource: "封神大势与个人布局冲突",
          },
        ],
      },
      {
        title: "备选阵容一",
        summary: "备选。",
        members: [
          { name: "甲", role: "主角", gender: "unknown", castRole: "protagonist", storyFunction: "推进主线" },
          { name: "乙", role: "盟友", gender: "unknown", castRole: "ally", storyFunction: "支援主角" },
          { name: "丙", role: "对手", gender: "unknown", castRole: "antagonist", storyFunction: "制造压力" },
        ],
        relations: [
          { sourceName: "甲", targetName: "乙", surfaceRelation: "合作" },
          { sourceName: "甲", targetName: "丙", surfaceRelation: "对抗" },
        ],
      },
      {
        title: "备选阵容二",
        summary: "备选。",
        members: [
          { name: "丁", role: "主角", gender: "unknown", castRole: "protagonist", storyFunction: "推进主线" },
          { name: "戊", role: "盟友", gender: "unknown", castRole: "ally", storyFunction: "支援主角" },
          { name: "己", role: "对手", gender: "unknown", castRole: "antagonist", storyFunction: "制造压力" },
        ],
        relations: [
          { sourceName: "丁", targetName: "戊", surfaceRelation: "合作" },
          { sourceName: "丁", targetName: "己", surfaceRelation: "对抗" },
        ],
      },
    ],
  });

  const protagonist = parsed.options[0].members[0];
  assert.equal(protagonist.personality.includes("隐忍"), true);
  assert.equal(protagonist.factionLabel, "阐教");
  assert.deepEqual(protagonist.prohibitions, ["不得自称截教外门弟子"]);
  assert.equal(parsed.options[1].members[0].personality, "");
  assert.deepEqual(parsed.options[1].members[0].prohibitions, []);
});

test("character cast quality gate blocks missing required structural fields only", () => {
  const storyInput = "打工人刘雪婷穿越到秦朝成为太监，最后发现自己竟然就是赵高。";
  const assessment = assessCharacterCastBatch([
    {
      id: "option_bad",
      title: "结构缺失版",
      summary: "缺少稳定主角和必要字段。",
      whyItWorks: "有冲突。",
      recommendedReason: "快。",
      members: [
        {
          name: "谜团催化剂",
          role: "线索角色",
          castRole: "ally",
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
  assert.ok(issueCodes.includes("missing_gender"));
  assert.ok(issueCodes.includes("missing_protagonist"));
  assert.match(buildCharacterCastBlockedMessage(assessment), /需要你确认后再应用到正式角色库/);
});

test("character cast quality gate accepts cast that satisfies the structural contract", () => {
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

test("character cast quality gate does not hard-code identity anchors from marketing wording", () => {
  const storyInput = [
    "作品定位：以‘成为原著主角’为卖点的高代入感穿书文，主打身份冲突与权谋反转。",
    "核心卖点：直接成为徐凤年本人，拥有其武功底子、父亲徐骁的支持以及原著中他没有的预知能力。",
  ].join("\n");
  const assessment = assessCharacterCastBatch([
    {
      id: "snow_blade_cast",
      title: "北凉世子逆命局",
      summary: "穿越成徐凤年，身负原著记忆与武道根基，从被动模仿到主动破局。",
      whyItWorks: "徐凤年本人、北凉世子身份和穿越预知都由主角线直接承接。",
      recommendedReason: "适合长篇穿书同人推进。",
      members: [
        {
          name: "徐凤年",
          role: "主角",
          gender: "male",
          castRole: "protagonist",
          relationToProtagonist: "主角本人",
          storyFunction: "以北凉世子身份利用原著记忆改变雪中命运",
          shortDescription: "穿越成北凉世子的现代读者，必须在原著轨迹与自主选择之间破局",
          outerGoal: "保住北凉并改写关键人物悲剧",
          innerNeed: "从模仿原著徐凤年转为承担自己的选择",
          fear: "偏离原著后失去所有已知优势",
          wound: "被迫替代原著人物身份",
          misbelief: "只要照搬原著就能安全通关",
          secret: "拥有原著剧情记忆",
          moralLine: "不把重要同伴当成通关工具",
          firstImpression: "表面纨绔，内里紧绷",
        },
        {
          name: "徐骁",
          role: "北凉王",
          gender: "male",
          castRole: "pressure_source",
          relationToProtagonist: "父亲",
          storyFunction: "以北凉利益和父子试探持续压迫主角成长",
          shortDescription: "北凉王，既保护徐凤年也考验徐凤年",
          outerGoal: "确保北凉后继有人",
          innerNeed: "确认儿子能承担北凉",
          fear: "北凉后继无人",
          wound: "",
          misbelief: "",
          secret: "察觉徐凤年与过去不同",
          moralLine: "",
          firstImpression: "威压深重",
        },
      ],
      relations: [
        {
          sourceName: "徐凤年",
          targetName: "徐骁",
          surfaceRelation: "父子",
          hiddenTension: "徐骁怀疑儿子变化，徐凤年害怕穿越身份暴露",
          conflictSource: "北凉路线与原著预知之间的冲突",
        },
      ],
    },
  ], storyInput);

  assert.equal(assessment.autoApplicableOptionId, "snow_blade_cast");
  assert.equal(assessment.options[0].issues.length, 0);
});

test("character cast quality gate does not block concrete cast on malformed abstract current-identity fragment", () => {
  const storyInput = "身份重塑：她成为了一个活在阴影中的人，最后发现自己竟然就是赵高。";
  const assessment = assessCharacterCastBatch([
    {
      id: "option_identity_fragment",
      title: "身份重塑",
      summary: "刘雪婷以秦宫太监身份求生，逐步逼近赵高真相。",
      whyItWorks: "主角身份、制度压迫和隐藏真相都有人物承接。",
      recommendedReason: "既能开篇求生，也能撑起长线身份反转。",
      members: [
        {
          name: "刘雪婷",
          role: "现代打工人 / 秦宫太监",
          gender: "female",
          castRole: "protagonist",
          relationToProtagonist: "主角本人",
          storyFunction: "在求生与权谋夹击中逼近赵高真相",
          shortDescription: "被迫披着太监身份在秦宫内廷求生的现代女性",
          outerGoal: "先活下来并站稳脚跟",
          innerNeed: "搞清自己与赵高命运线为何重叠",
          fear: "被权力机器吞没",
          wound: "失去原本人生",
          misbelief: "只要足够低头就能保命",
          secret: "她身上的命运线最终指向赵高",
          moralLine: "不愿靠滥杀无辜换取安全",
          firstImpression: "谨慎、能忍、反应快",
        },
        {
          name: "赵成",
          role: "内廷老宦者",
          gender: "male",
          castRole: "mentor",
          relationToProtagonist: "引路兼试探者",
          storyFunction: "让主角看见秦宫的生存规则与权力链条",
          shortDescription: "熟悉内廷暗规的老资格宦者",
          outerGoal: "稳住自己在宫中的位置",
          innerNeed: "找到可押注的活棋",
          fear: "被更上层清洗",
          wound: "",
          misbelief: "",
          secret: "知道部分与赵高有关的旧事",
          moralLine: "",
          firstImpression: "老辣克制",
        },
        {
          name: "胡亥",
          role: "危险皇子",
          gender: "male",
          castRole: "pressure_source",
          relationToProtagonist: "能随时碾死她的权力对象",
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
          targetName: "赵成",
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
          surfaceRelation: "近侍与皇子",
          hiddenTension: "她越靠近胡亥，越接近赵高命运",
          conflictSource: "侍奉带来的高压风险",
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
