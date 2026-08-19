# PAI 启示五：TELOS 创作者身份与规则偏好可实操落地规范 (TELOS Creator Profile System)

本文档针对 Daniel Miessler PAI 框架的**启示五（TELOS 创作者身份系统：TELOS Identity System）**，结合 **Daydream Engine（白日做梦引擎 / GeneralAgent）** 的真实后端服务、HTTP 路由接口与前端交互规范，提供具象到代码文件、API Endpoint、JSON 格式与单元测试的可实操落地方案。

---

## 一、 真实代码落地架构 (Implementation Architecture)

```
                            TELOS 创作者 Profile 落地架构图
                            
  +-----------------------------------------------------------------------------------------+
  |  前端 UI 交互层                                                                           |
  |  ├─ 界面入口: /settings (创作者风格与避坑偏好)                                            |
  |  ├─ HTTP 端点: GET/POST /api/creator/profile                                            |
  |  ├─ 预设装载: POST /api/creator/profile/preset                                         |
  |  └─ 访谈解析: POST /api/creator/profile/interview-parse                                 |
  +-----------------------------------------------------------------------------------------+
                                               │ HTTP 请求
                                               ▼
  +-----------------------------------------------------------------------------------------+
  |  后端服务层: CreatorProfileService.ts (server/src/platform/profile/)                     |
  |  ├─ getProfile(): 读取 AppSetting ("creator.profile")                                   |
  |  ├─ saveProfile(): 防覆写保存 TELOS Profile                                             |
  |  ├─ loadPresetProfile(presetKey): 装载预置美学 (修仙/悬疑古风/赛博朋克/都市爽文)          |
  |  └─ getFormattedCreatorProfileContext(): 格式化为 Cold Memory 上下文分块                 |
  +-----------------------------------------------------------------------------------------+
                                               │
                                               ▼ 存储
  +-----------------------------------------------------------------------------------------+
  |  Prisma / SQLite: AppSetting 表 (key: "creator.profile", value: JSON string)            |
  +-----------------------------------------------------------------------------------------+
```

---

## 二、 核心代码文件与数据类型定义

### 1. 数据类型定义 ([creatorProfileTypes.ts](file:///Users/nvidia/GeneralAgent/server/src/platform/profile/creatorProfileTypes.ts))

```typescript
export type PresetKey = "xiuxian" | "xuanyi" | "cyberpunk" | "dushi";

export interface TelosCreatorProfile {
  mission?: string;             // 创作使命 (如: "探讨人性微光与宿命反抗")
  goals?: string[];             // 目标偏好 (如: ["单章强悬念", "节奏紧凑"])
  beliefs?: string[];           // 核心价值观
  writingModels?: string[];     // 偏好的叙事结构模型
  writingStrategies?: string[]; // 常用写作策略 (如: "前 500 字必须出现冲突钩子")
  narrativeTone?: string;       // 专属口吻风味 (如: "冷峻克制、感官细节丰富")
  learnedTaboos?: string[];     // 禁用忌讳套路 (如: "严禁机械降神", "少用感叹词")
  challengesToAvoid?: string[]; // 防范瓶颈
}

export interface CreatorProfileStoreInput {
  creatorName?: string;
  activePreset?: PresetKey | null;
  profile: TelosCreatorProfile;
}

export const BUILTIN_CREATOR_PRESETS: Record<PresetKey, { label: string; profile: TelosCreatorProfile }> = {
  xiuxian: {
    label: "修仙立志",
    profile: {
      mission: "讲述凡人逆天改命、坚守本心的修仙传奇",
      narrativeTone: "宏大浩瀚、古风意境、动作描写利落",
      writingStrategies: ["章尾保留悬念", "境界突破突出艰难反差"],
      learnedTaboos: ["严禁主角无脑圣母", "少用现代网络流行语", "严禁机械降神"],
    },
  },
  xuanyi: {
    label: "悬疑古风",
    profile: {
      mission: "揭示深宅大院与市井暗流中的人心诡谲",
      narrativeTone: "暗流涌动、冷峻克制、重视细节与潜台词",
      writingStrategies: ["前 500 字抛出线索钩子", "对话带有隐藏动机"],
      learnedTaboos: ["严禁直接剧透凶手动机", "少用叙述性直接叹词", "严禁使用逻辑漏洞解谜"],
    },
  },
  cyberpunk: {
    label: "赛博朋克",
    profile: {
      mission: "展现高科技低生活下的个体挣扎与人性火花",
      narrativeTone: "霓虹阴冷、感官细节丰富、节奏硬核",
      writingStrategies: ["场景结合科技与破败对比", "强化身体改造与心理心理冲突"],
      learnedTaboos: ["严禁说教式大段背景科普", "少用低幼拟声词"],
    },
  },
  dushi: {
    label: "都市爽文",
    profile: {
      mission: "小人物逆袭翻盘，带来畅快淋漓的阅读体验",
      narrativeTone: "节奏明快、情感张力强、爽点突出",
      writingStrategies: ["打脸翻盘需有铺垫", "冲突升级迅速"],
      learnedTaboos: ["严禁拖沓憋屈超过 2 章", "少用平淡说明性文字"],
    },
  },
};
```

---

## 三、 HTTP API 路由规范 ([creatorProfileRoutes.ts](file:///Users/nvidia/GeneralAgent/server/src/routes/creatorProfileRoutes.ts))

后端暴露 4 个标准 REST 路由：

1. `GET /api/creator/profile`
   * **功能**：获取当前创作者的 Profile 与激活的预设。
   * **返回 Shape**：`{ success: true, data: CreatorProfileStoreInput }`
2. `POST /api/creator/profile`
   * **功能**：更新并保存创作者 Profile。
   * **Body**：`{ profile: TelosCreatorProfile }`
3. `POST /api/creator/profile/preset`
   * **功能**：一键装载指定美学预设。
   * **Body**：`{ presetKey: "xiuxian" | "xuanyi" | "cyberpunk" | "dushi" }`
4. `POST /api/creator/profile/interview-parse`
   * **功能**：接收 AI 访谈对话文本，解析提取为 `TelosCreatorProfile` 对象。
   * **Body**：`{ qaText: string }`

---

## 四、 单元测试与验证规范 ([creatorProfile.test.js](file:///Users/nvidia/GeneralAgent/server/tests/creatorProfile.test.js))

测试用例覆盖：
1. 验证 `getProfile` 与 `saveProfile` 的 Prisma `AppSetting` 读写。
2. 验证 `loadPresetProfile("xuanyi")` 能正确加载悬疑古风预设。
3. 验证 `getFormattedCreatorProfileContext()` 输出包含 `=== [CREATOR TELOS PROFILE] ===` 及 `learnedTaboos` 格式化文本。
4. 验证当 `profile` 为空时，函数优雅返回空字符串且零报错。

---

* **文档位置**：[docs/wiki/architecture/pai-insight-5-telos-creator-profile-design.md](file:///Users/nvidia/GeneralAgent/docs/wiki/architecture/pai-insight-5-telos-creator-profile-design.md)
* **状态**：启示五可实操落地架构与代码路由规范已归档 Wiki
