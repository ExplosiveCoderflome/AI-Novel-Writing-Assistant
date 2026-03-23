可以。那我直接把这部分收成一份：

# 世界管理 → 故事宏观规划 的接口设计

这个接口的目标，不是把整个世界观扔给下游，而是做一件很关键的事：

> **把“世界的全量设定”，压缩成“这本小说当前可用的有效世界切片”。**

也就是说，世界管理是原料库，故事宏观规划拿到的应该是：

* 足够有用
* 足够克制
* 足够有约束
* 能直接参与“故事引擎生成”

而不是一大坨设定说明。

---

# 一、先定接口职责

这个接口要解决 4 个问题。

### 1. 从世界全量资源中裁剪出“本书相关”的部分

不是所有势力、地点、规则都和当前小说有关。

---

### 2. 把静态设定转成“叙事可用信息”

比如：

* 世界里有某势力
  不如输出
* 这个势力会怎样压迫主角

---

### 3. 为故事宏观规划提供“可直接生成故事引擎”的输入

也就是能直接用于生成：

* premise
* core conflict
* hook
* growth path
* setpiece seeds

---

### 4. 限制后续生成范围

这一步非常重要。

故事宏观规划一旦起步，后面角色、剧情、章节就都会被它影响。
所以这个接口必须提前把“不能乱用的世界信息”卡住。

---

# 二、接口在整个系统中的位置

你可以把它理解成一个中间层：

```text
世界管理（全量世界）
    ↓
世界切片提取 / 小说绑定接口
    ↓
故事宏观规划（生成故事引擎）
    ↓
角色设定 / 剧情规划 / 写作
```

这个中间层，本质上是个：

> **Story World Slice Builder**

它不是生成故事，它是为故事准备“可控舞台”。

---

# 三、输入与输出边界

---

## 1. 输入来自哪里

这个接口的输入，建议分成两部分：

### A. 世界管理侧输入

来自世界库的结构化数据：

* `world_profile`
* `world_rules`
* `factions`
* `forces`
* `locations`
* `special_elements`
* `relations`

---

### B. 小说侧输入

来自用户当前这本小说的初始信息：

* 小说基本信息
* 故事想法 / 一句话 premise
* 题材倾向
* 风格倾向
* 是否指定主舞台
* 是否指定某些势力/地点必须出现

也就是说，它不是只读世界，还要结合“这本书想讲什么”。

---

## 2. 输出给谁

输出给“故事宏观规划模块”。

所以输出不能偏“百科说明”，而要偏“叙事压缩结果”。

---

# 四、推荐的接口目标对象

我建议你不要直接把世界对象传下去，而是专门定义一个中间对象：

# `story_world_slice`

它是这个接口唯一的标准输出。

---

## 推荐结构

```json
{
  "story_world_slice": {
    "story_id": "当前小说ID",
    "world_id": "世界ID",
    "core_world_frame": {
      "genre_base": "",
      "era_background": "",
      "tone_tags": [],
      "core_theme": "",
      "world_summary_for_story": ""
    },
    "applied_rules": {
      "hard_rules": [],
      "soft_rules": [],
      "forbidden_directions": [],
      "truth_mode": "",
      "power_boundary": "",
      "life_death_boundary": ""
    },
    "active_forces": [],
    "active_locations": [],
    "active_elements": [],
    "conflict_candidates": [],
    "pressure_sources": [],
    "mystery_sources": [],
    "suggested_story_axes": {
      "primary_axis": "",
      "secondary_axis": "",
      "hidden_axis": ""
    },
    "recommended_entry_points": [],
    "forbidden_combinations": [],
    "story_scope_boundary": {
      "allowed_stage": "",
      "initial_visibility": "",
      "expansion_ceiling": ""
    }
  }
}
```

这个对象就是世界管理传给故事宏观规划的“压缩包”。

---

# 五、输出内容应该包含什么

下面我按“故事宏观规划真正需要什么”来拆。

---

## 1. 核心世界框架 core_world_frame

这一部分不是完整世界观介绍，而是给下游一个世界气质底板。

例如：

```json
{
  "core_world_frame": {
    "genre_base": "都市克苏鲁悬疑",
    "era_background": "现代",
    "tone_tags": ["压抑", "失真", "冷静", "逐步崩塌"],
    "core_theme": "认知崩坏下的自我维持",
    "world_summary_for_story": "现实表层稳定，但某些封闭机构内部存在无法公开解释的异常污染与认知错位。"
  }
}
```

它的作用是让故事宏观规划模块知道：

* 应该往什么气质上写
* 不该写成什么东西
* 用户的故事适合放在哪种世界密度里

---

## 2. 应用规则 applied_rules

这是最关键的一层之一。

这里要把世界规则翻译成“当前小说需要遵守的规则”。

注意，不是把世界规则全量照搬，而是分成三类：

### A. hard_rules

绝对不能违背

例如：

* 超自然现象不能被大众公开验证
* 真相不可一次性完整揭示
* 主角前期不可能直接接触最高层真相

### B. soft_rules

建议遵守，但允许后续突破

例如：

* 叙事应以封闭空间压迫感为主
* 超常力量不应早期显性展示
* 冲突优先通过信息错位而非正面对抗展开

### C. forbidden_directions

明确禁止方向

例如：

* 禁止直接写成全民超能力都市
* 禁止前期引入多个无关大型势力
* 禁止让世界观解释先于人物危机

---

## 3. active_forces

这里不是输出世界中所有势力，而是输出：

> **本书当前阶段建议激活的势力**

并且每个势力必须做“叙事化翻译”。

推荐结构：

```json
{
  "id": "force_001",
  "name": "市立精神康复中心管理层",
  "surface_role": "主角的工作体系与日常权威来源",
  "hidden_role": "压制异常外泄的现实封锁力量",
  "pressure_style": "制度压迫、信息封锁、责任转嫁",
  "narrative_function": "前期制造现实困局，中期暴露遮掩真相的动机",
  "visibility_phase": "early",
  "danger_level": "medium"
}
```

这样下游拿到后，能直接用于构建：

* 外部冲突
* 职场压迫
* 体制对抗
* 真相掩埋

而不是只知道“有这么个势力”。

---

## 4. active_locations

同理，这里不是地点表，而是“当前小说的可用舞台”。

推荐结构：

```json
{
  "id": "loc_001",
  "name": "封闭病区",
  "surface_role": "主角日常值班与护理工作的核心场所",
  "hidden_role": "异常最早外显但被伪装成病理现象的区域",
  "narrative_function": "用于制造第一次认知错位与持续不安",
  "restriction": "主角无法轻易离开工作环境，也不能公开谈论异常",
  "setpiece_potential": "夜班巡房、病历失真、病人说出不该知道的事",
  "priority": "highest"
}
```

地点输出一定要强调：

* 为什么它重要
* 它怎样限制主角
* 在这里容易出什么戏

---

## 5. active_elements

这是当前小说可调用的异常要素、物件、知识、规则片段。

推荐结构：

```json
{
  "id": "element_001",
  "name": "错误病历",
  "category": "knowledge",
  "story_use": "作为异常首次被主角察觉的线索媒介",
  "risk": "越试图核对，主角越会发现现实记录不可靠",
  "reveal_phase": "early"
}
```

这类输出很重要，因为它会直接变成：

* hook 种子
* 线索道具
* 反转触发器
* setpiece 元件

---

## 6. conflict_candidates

这是专门给故事宏观规划模块喂“可成立冲突”的。

它不是一句概括，而是一组候选冲突轴。

推荐结构：

```json
{
  "conflict_candidates": [
    {
      "type": "external",
      "summary": "主角发现异常，但制度体系要求其将一切归为病理幻觉",
      "source_nodes": ["force_001", "loc_001"],
      "story_value": "天然适合前期持续施压"
    },
    {
      "type": "internal",
      "summary": "主角开始怀疑自己是否也正在出现精神异常",
      "source_nodes": ["element_001"],
      "story_value": "强化克苏鲁题材中的认知失稳"
    },
    {
      "type": "relational",
      "summary": "某位病人与主角形成诡异共识，但其可信度本身极低",
      "source_nodes": ["loc_001", "element_002"],
      "story_value": "制造信任悖论"
    }
  ]
}
```

这个字段的价值非常高，因为它几乎能直接喂给你前面设计的：

* `conflict_layers`
* `core_conflict`
* `main_hook`

---

## 7. pressure_sources

这个字段我很建议单独保留。

因为世界元素并不都会制造压力，但故事一定需要压力源。

推荐结构：

```json
{
  "pressure_sources": [
    {
      "source_type": "force",
      "source_id": "force_001",
      "pressure_mode": "制度性否认与责任压制"
    },
    {
      "source_type": "location",
      "source_id": "loc_001",
      "pressure_mode": "封闭空间中的持续异常暴露"
    },
    {
      "source_type": "element",
      "source_id": "element_001",
      "pressure_mode": "信息越求证越失真"
    }
  ]
}
```

这个字段会让故事宏观规划模块更容易生成真正“能跑起来”的故事，而不是漂亮但没压迫感的框架。

---

## 8. mystery_sources

如果没有这个，故事很容易变成“冲突有了，但钩子不强”。

你需要单独告诉下游：

> 这个世界切片里，哪些东西适合成为“核心未知”来源

推荐结构：

```json
{
  "mystery_sources": [
    {
      "source_id": "loc_002",
      "question_seed": "为什么地下封存区从未出现在正式建筑图纸里？"
    },
    {
      "source_id": "element_001",
      "question_seed": "为什么某份病历会记录主角尚未经历过的夜班事件？"
    }
  ]
}
```

这个字段几乎可以直接供下游生成：

* `main_hook`
* `mystery_box`
* `major_payoffs`

---

## 9. suggested_story_axes

这里的意思是：

> 这个世界切片最适合沿哪几条故事轴来展开

例如：

```json
{
  "suggested_story_axes": {
    "primary_axis": "现实秩序对异常真相的压制",
    "secondary_axis": "主角对自身精神状态的怀疑",
    "hidden_axis": "某种更高层存在正借由病患群体渗入现实"
  }
}
```

这个字段特别适合喂给“故事宏观规划模块”，因为它会帮助模型理解：

* 主线写什么
* 副线写什么
* 暗线藏什么

---

## 10. story_scope_boundary

这个字段是为了防止后续故事开太大。

推荐结构：

```json
{
  "story_scope_boundary": {
    "allowed_stage": "以医院及其周边为初期主要舞台",
    "initial_visibility": "异常仅限少数角色察觉",
    "expansion_ceiling": "前中期不得直接扩展到全国级公开灾变"
  }
}
```

这就是你一直在追求的那个东西：

> **防跑偏约束**

---

# 六、接口的工作流程怎么设计

你可以把这个接口拆成 4 步。

---

## Step 1：读取世界全量资源

输入：

* 世界规则
* 势力
* 地点
* 要素
* 关系

这一步只是拿数据。

---

## Step 2：结合当前小说需求进行相关性筛选

根据小说输入信息判断：

* 哪些规则与本书强相关
* 哪些势力适合进入本书
* 哪些地点适合作为主舞台
* 哪些元素能形成 hook / mystery / payoff

这一步本质上是在做：

> 世界资源相关性匹配

---

## Step 3：把资源翻译成叙事对象

例如：

* 势力 → 压力源
* 地点 → 舞台与限制器
* 要素 → 线索与异化装置
* 关系 → 冲突与反转来源

这一步特别重要，因为它决定下游拿到的是“可生成对象”，而不是“设定条目”。

---

## Step 4：输出 `story_world_slice`

这是标准出口。

故事宏观规划模块只读这个对象，不直接读世界库原始数据。

这会让系统边界特别清晰。

---

# 七、建议的调用时机

这个接口建议在两个时机调用。

---

## 时机 1：创建小说宏观规划之前

这是主调用时机。

顺序应该是：

```text
小说基本信息
→ 故事想法输入
→ 调用世界切片接口
→ 生成 story_world_slice
→ 再生成故事宏观规划
```

---

## 时机 2：用户修改世界绑定后重新生成

比如用户后来调整了：

* 本书主舞台
* 激活势力
* 某个异常要素是否启用

这时候重新调用接口，刷新 `story_world_slice`，再增量更新故事宏观规划。

---

# 八、和你现有“故事宏观规划 prompt”的衔接方式

你之前那个 prompt 里核心是输出：

* expansion
* decomposition
* issues

现在如果接入这个接口，我建议下游 prompt 的输入从原来的：

> 用户一句话故事想法

变成：

> 用户故事想法 + `story_world_slice`

这样模型在做宏观规划时，就不再“凭空补”，而是在一个已经被裁剪好的世界舞台里推故事。

---

## 推荐下游输入结构

```json
{
  "story_input": {
    "title": "",
    "genre": "",
    "user_premise": "一个精神病护理员卷入克苏鲁事件"
  },
  "story_world_slice": {
    "...": "来自接口输出"
  }
}
```

然后 prompt 明确要求模型：

* 优先使用 `story_world_slice` 中的 active 内容
* 不得擅自扩大世界范围
* 不得引入未激活的高层设定
* 如果故事需求与 world slice 冲突，写入 issues

这时候你的故事宏观规划模块会稳很多。

---

# 九、推荐的数据字段最小版本 MVP

如果你现在不想一次性做太重，可以先做一个 MVP 版接口。

---

## 输入

* 世界规则摘要
* 3 个以内 active forces
* 3 个以内 active locations
* 2 个以内 active elements
* 用户一句话故事想法

---

## 输出

```json
{
  "story_world_slice": {
    "core_world_frame": {},
    "applied_rules": {},
    "active_forces": [],
    "active_locations": [],
    "active_elements": [],
    "conflict_candidates": [],
    "pressure_sources": [],
    "mystery_sources": [],
    "story_scope_boundary": {}
  }
}
```

这个版本已经足够支撑“故事宏观规划”阶段。

---

# 十、你现在最该记住的一句话

这个接口不是在做：

> “把世界设定传给故事”

而是在做：

> **“把世界压缩成可被故事使用的局部战场”**

这是两回事。前者容易变成设定堆积，后者才能形成真正的生成闭环。
