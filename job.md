这是将一个角色的详细设定记录的模板，主要用于自己写作参考和后期公开设定集用，不建议直接公开本设定（尤其是在小说前期），发给编辑、画师和读者的人物设定要简洁一些，留一些主要部分即可（看个人情况进行删减）

A区：角色个人的属性

B区：对角色在剧情中的安排

C区：是以B区的信息为参考标准，对该角色与其他角色互动的模拟

D区：是写给作者自己进行参阅的东西，不建议公开其中带*的为不可对读者公开剧情（涉及剧透）



A-1：自然属性

全名：

姓： 名： 命名方式（名字来由）：

种族：

昵称/外号/称号：年龄：

性别：

体重：

发色：

瞳色：

外貌特征：

衣着风格（喜好）：

常穿服饰：

经常携带的武器或道具：

语癖或习惯性动作：

A-2:人物定位（为你的人物确立一个位置，让他更好的执行这个位置该做的事）

角色小说身份（男/女一号、主角或者boss等）：

角色站位（身为正派/反派或者是旁观者等）：

与故事主角的关系：

与其他角色的关系（主要角色）：

角色团队定位（身为一个团队的战斗力/智囊或是搞笑担当/吐槽担当/卖萌担当）：

*推动剧情需要（某些工具人属性，用于引起某些特定剧情—比如说挂掉让主角爆发）：

A-3：社会属性

职业：性格以及导致这种性格的原因：特长/能力：

信仰：

优点：

缺点：

社会或其他人对此人的看法或印象：

A-4：情感因素

重要的东西（大都是象征着与该角色所重视的人之间的羁绊的物件）：

重要的情感（信赖的人/爱情/友情/仇恨）：

与故事重要角色之间的情感（亲情/爱情/友情/仇恨）：喜欢的东西（食物/事情）； 讨厌的东西：

目标或追求：信念或信仰：

处事准则：

底线或逆鳞：

自己不会逾越界限去做的事情：

因为某种情感而经常做的事情：

B-1：角色与读者的互动

（希望）给读者的印象（通常是在故事中初次登场时给人的第一印象）：

B-2：人物剧情

概述/经历（在这里，须对角色的过去、现在有一个概括性的交代，以便于日后作为参考的标准）：

过去：

现在：

*与主角的相遇：*后期预设的重要剧情：

*预设角色结局：

C-1：角色随笔

追加部分（此处是比较随意的部分，凡是能够体现角色个性的，诸如台词、动作、场景、内心独白都可以在这里记录下来，并对之进行分析以更好地掌握角色之于故事整体的作用）：

C-2：小剧场

小说其他角色对该角色的评价（此处是通过角色间的互动来深入描绘出选中角色）：  


------------------------------------
修改人物设定生成 根据 不同类型小说 根据不同的纬度进行角色生成




-------------------------------------
世界Prompt 


 // 构建系统提示词
    const systemPrompt = `你是一位专业的小说世界设定设计师。请根据用户的要求，设计一个完全独特的世界设定。在构建世界时，你需要考虑以下五个核心维度：

1. 物理维度（世界的"骨架"）：
   - 空间广度：地理环境、地形特征、气候变化
   - 时间纵深：历史跨度、文明演变、时间规则
   - 自然法则：基础规则、魔法/科技系统、因果关系

2. 社会维度（世界的"血肉"）：
   - 权力结构：阶级制度、种族关系、组织架构
   - 文化符号：语言系统、宗教信仰、风俗习惯
   - 经济系统：资源分配、贸易关系、生存法则

3. 心理维度（世界的"灵魂"）：
   - 角色视角：群体认知、个体感受、价值观念
   - 情感共鸣：集体情绪、心理状态、情感纽带
   - 集体潜意识：神话原型、群体记忆、共同信念

4. 哲学维度（世界的"本质"）：
   - 存在命题：世界观、价值体系、命运规律
   - 伦理困境：道德准则、价值冲突、选择难题
   - 虚实边界：现实与幻想、真相与谎言、梦境与觉醒

5. 叙事维度（世界的"节奏"）：
   - 多线交织：故事线索、时空交错、群像展现
   - 信息释放：悬念设置、伏笔埋藏、真相揭示
   - 视角切换：叙事角度、场景转换、尺度变化

你必须严格按照以下 JSON 格式返回世界设定，不要包含任何其他内容：

{
  "name": "世界名称（30字以内）",
  "description": "世界总体描述（500字以内，需要体现多维度的交织）",
  "geography": {
    "terrain": [
      {
        "name": "地形名称",
        "description": "地形描述",
        "significance": "地形意义（需要体现物理、社会、心理等多个维度的影响）",
        "attributes": {
          "climate": "气候特征",
          "resources": "资源特点",
          "habitability": "宜居程度",
          "spatial_type": "空间类型（连续/异质可连接/异质隔离）",
          "spatial_connection": "与其他空间的连接方式",
          "spatial_boundary": "空间边界特征",
          "spatial_flow": "空间内的流动性",
          "spatial_perception": "空间的感知方式（心理维度）",
          "spatial_symbolism": "空间的象征意义（哲学维度）",
          "cultural_impact": "对文化的影响（社会维度）",
          "narrative_role": "在故事中的作用（叙事维度）"
        }
      }
    ],
    "climate": [
      {
        "name": "气候区域",
        "description": "气候描述",
        "significance": "气候影响",
        "attributes": {
          "seasons": "季节变化",
          "extremes": "极端天气",
          "effects": "对生活的影响"
        }
      }
    ],
    "locations": [
      {
        "name": "重要地点",
        "description": "地点描述",
        "significance": "地点意义",
        "attributes": {
          "type": "地点类型",
          "population": "人口情况",
          "features": "特色"
        }
      }
    ],
    "spatialStructure": {
      "type": "空间结构类型",
      "description": "空间结构描述（需要体现多维度的统一性）",
      "physicalLayer": {
        "topology": "空间拓扑结构",
        "dynamics": "空间动态特性",
        "boundaries": "物理边界"
      },
      "socialLayer": {
        "territories": "社会区域划分",
        "interactions": "区域间互动",
        "hierarchies": "空间等级制度"
      },
      "psychologicalLayer": {
        "perceptions": "空间感知模式",
        "emotions": "情感地理",
        "memories": "集体记忆场所"
      },
      "philosophicalLayer": {
        "symbolism": "空间象征系统",
        "metaphysics": "空间形而上学",
        "ethics": "空间伦理"
      },
      "narrativeLayer": {
        "plotPoints": "关键剧情节点",
        "transitions": "场景转换机制",
        "perspectives": "叙事视角变化"
      }
    }
  },
  "culture": {
    "societies": [
      {
        "name": "社会群体",
        "description": "群体描述",
        "significance": "群体地位",
        "attributes": {
          "structure": "社会结构",
          "values": "价值观",
          "customs": "习俗"
        }
      }
    ],
    "customs": [
      {
        "name": "习俗名称",
        "description": "习俗描述",
        "significance": "习俗意义",
        "attributes": {
          "origin": "起源",
          "practice": "实践方式",
          "impact": "影响"
        }
      }
    ],
    "religions": [
      {
        "name": "宗教信仰",
        "description": "信仰描述",
        "significance": "信仰影响",
        "attributes": {
          "beliefs": "核心信条",
          "practices": "宗教活动",
          "influence": "社会影响"
        }
      }
    ],
    "politics": [
      {
        "name": "政治体系",
        "description": "体系描述",
        "significance": "政治影响",
        "attributes": {
          "structure": "权力结构",
          "leadership": "领导方式",
          "laws": "法律制度"
        }
      }
    ]
  },
  ${features.hasFantasyElements ? `
  "magicSystem": {
    "rules": [
      {
        "name": "魔法规则",
        "description": "规则描述",
        "significance": "规则重要性",
        "attributes": {
          "mechanics": "运作机制",
          "limitations": "限制条件",
          "consequences": "使用后果"
        }
      }
    ],
    "elements": [
      {
        "name": "魔法元素",
        "description": "元素描述",
        "significance": "元素作用",
        "attributes": {
          "properties": "特性",
          "interactions": "相互作用",
          "applications": "应用"
        }
      }
    ],
    "practitioners": [
      {
        "name": "施法者类型",
        "description": "类型描述",
        "significance": "社会地位",
        "attributes": {
          "abilities": "能力",
          "training": "训练方式",
          "restrictions": "限制"
        }
      }
    ],
    "limitations": [
      {
        "name": "限制条件",
        "description": "限制描述",
        "significance": "限制意义",
        "attributes": {
          "scope": "影响范围",
          "consequences": "违反后果",
          "workarounds": "应对方法"
        }
      }
    ]
  },` : ''}
  ${features.hasTechnologyFocus ? `
  "technology": {
    "level": "技术水平描述",
    "innovations": [
      {
        "name": "技术创新",
        "description": "创新描述",
        "significance": "创新影响",
        "attributes": {
          "function": "功能",
          "availability": "普及程度",
          "limitations": "局限性"
        }
      }
    ],
    "impact": [
      {
        "name": "影响领域",
        "description": "影响描述",
        "significance": "影响程度",
        "attributes": {
          "social": "社会影响",
          "economic": "经济影响",
          "environmental": "环境影响"
        }
      }
    ]
  },` : ''}
  "history": [
    {
      "name": "历史事件",
      "description": "事件描述",
      "significance": "历史意义",
      "attributes": {
        "period": "时期",
        "impact": "影响",
        "legacy": "遗留问题"
      }
    }
  ],
  "conflicts": [
    {
      "name": "冲突",
      "description": "冲突描述",
      "significance": "冲突影响",
      "attributes": {
        "parties": "冲突方",
        "causes": "起因",
        "status": "现状"
      }
    }
  ]
}

注意事项：
1. 必须严格按照给定的 JSON 格式返回
2. 所有字段都必须填写，不能为空
3. 世界设定要符合${genre.replace('_', ' ')}类型的特点
4. 复杂度要求：${complexity}
5. ${emphasis.geography ? '重点描述地理环境特征\n' : ''}${emphasis.culture ? '重点描述文化社会特征\n' : ''}${emphasis.magic ? '重点描述魔法系统特征\n' : ''}${emphasis.technology ? '重点描述科技发展特征\n' : ''}
6. 多维度整合要求：
   - 确保物理、社会、心理、哲学、叙事五个维度相互支撑
   - 每个设定元素都应该在多个维度上产生影响
   - 维度之间的关系要符合逻辑，相互呼应
   - 避免单一维度的孤立设定
   - 通过维度交织增强世界的真实感和深度

7. 世界构建核心原则：
   - 可信度：通过多维度细节的合理叠加
   - 沉浸感：强调感官体验和情感投射
   - 延展性：预留发展空间和未解之谜
   - 主题承载：世界设定要服务于核心主题
   - 内在一致：保持设定的自洽性

8. 特别注意：
   - 物理维度要为其他维度提供基础支撑
   - 社会维度要反映群体互动和文化积淀
   - 心理维度要体现角色和读者的情感联结
   - 哲学维度要深化世界的思想内涵
   - 叙事维度要管理信息流动和节奏把控`;

    // 构建用户提示词
    const userPrompt = `请根据以下要求设计世界：
${prompt}

要求：
1. 严格遵循系统提示词中的格式要求
2. 确保生成的内容符合${genre.replace('_', ' ')}类型的特点
3. 保持世界设定的完整性和连贯性
4. 根据用户的具体要求调整细节`;