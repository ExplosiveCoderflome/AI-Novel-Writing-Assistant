import type {
  StoryWorldSliceBuilderMode,
  StoryWorldSliceOverrides,
} from "@ai-novel/shared/types/storyWorldSlice";
import type {
  WorldBindingSupport,
  WorldStructuredData,
} from "@ai-novel/shared/types/world";

function formatRules(structure: WorldStructuredData): string {
  if (structure.rules.axioms.length === 0) {
    return "暂无明确规则。";
  }
  return structure.rules.axioms
    .map((rule) => [
      `- [${rule.id}] ${rule.name}`,
      rule.summary && `说明: ${rule.summary}`,
      rule.cost && `代价: ${rule.cost}`,
      rule.boundary && `边界: ${rule.boundary}`,
      rule.enforcement && `执行后果: ${rule.enforcement}`,
    ].filter(Boolean).join(" | "))
    .join("\n");
}

function formatForces(structure: WorldStructuredData): string {
  if (structure.forces.length === 0) {
    return "暂无明确势力。";
  }
  return structure.forces
    .map((force) => [
      `- [${force.id}] ${force.name}`,
      force.type && `类型: ${force.type}`,
      force.summary && `概述: ${force.summary}`,
      force.currentObjective && `当前目标: ${force.currentObjective}`,
      force.pressure && `施压方式: ${force.pressure}`,
      force.narrativeRole && `叙事作用: ${force.narrativeRole}`,
    ].filter(Boolean).join(" | "))
    .join("\n");
}

function formatLocations(structure: WorldStructuredData): string {
  if (structure.locations.length === 0) {
    return "暂无明确地点。";
  }
  return structure.locations
    .map((location) => [
      `- [${location.id}] ${location.name}`,
      location.terrain && `地形: ${location.terrain}`,
      location.summary && `概述: ${location.summary}`,
      location.narrativeFunction && `叙事功能: ${location.narrativeFunction}`,
      location.risk && `风险: ${location.risk}`,
      location.entryConstraint && `进入限制: ${location.entryConstraint}`,
      location.exitCost && `离开代价: ${location.exitCost}`,
    ].filter(Boolean).join(" | "))
    .join("\n");
}

export function buildStoryWorldSlicePrompt(input: {
  novel: {
    id: string;
    title: string;
    description?: string | null;
    styleTone?: string | null;
    narrativePov?: string | null;
    pacePreference?: string | null;
    emotionIntensity?: string | null;
  };
  structure: WorldStructuredData;
  bindingSupport: WorldBindingSupport;
  storyInput: string;
  overrides: StoryWorldSliceOverrides;
  builderMode: StoryWorldSliceBuilderMode;
}): { system: string; user: string } {
  const { novel, structure, bindingSupport, storyInput, overrides, builderMode } = input;
  return {
    system: [
      "你是小说世界接入规划器。",
      "你的任务不是复述整个世界百科，而是把上游世界设定裁剪成『这本书会真正用到的世界设定』。",
      "必须优先保留：会实际影响这本书冲突、地点调度、规则约束、悬念来源和压力来源的部分。",
      "不要把所有世界设定都塞进结果。必须主动删掉和当前故事无关的设定。",
      "如果用户输入的故事想法与世界边界或禁止搭配明显冲突，必须在 storyScopeBoundary 和 forbiddenCombinations 中体现冲突风险。",
      "只允许输出严格 JSON，不要解释。",
      "activeElements 首期只允许提炼为可叙事使用的线索、规则片段、地点线索或势力线索，不要发明新的世界模型。",
      "activeForces、activeLocations、appliedRules 都必须引用现有的 id。",
      "recommendedEntryPoints、pressureSources、conflictCandidates 可直接结合 bindingSupport 和当前故事意图裁剪。",
      "JSON 结构必须是：",
      "{",
      '  "coreWorldFrame": "这本书真正会用到的舞台概括",',
      '  "appliedRules": [{"id":"rule-id","whyItMatters":"为什么这条规则会真实影响这本书"}],',
      '  "activeForces": [{"id":"force-id","roleInStory":"在这本书中的作用","pressure":"这股力量会给主角/主线带来什么压力"}],',
      '  "activeLocations": [{"id":"location-id","storyUse":"这个地点适合承载什么剧情","risk":"在这里会出什么问题"}],',
      '  "activeElements": [{"id":"element-id","label":"元素名","type":"rule|force|location|binding","summary":"一句话说明"}],',
      '  "conflictCandidates": ["可直接展开的冲突"],',
      '  "pressureSources": ["主要压力源"],',
      '  "mysterySources": ["适合持续吊读者的问题"],',
      '  "suggestedStoryAxes": ["建议重点推进的故事轴"],',
      '  "recommendedEntryPoints": ["适合开局的切入口"],',
      '  "forbiddenCombinations": ["不应同时出现或会明显跑偏的搭配"],',
      '  "storyScopeBoundary": "这本书应该把故事控制在什么边界内"',
      "}",
    ].join("\n"),
    user: [
      `小说标题：${novel.title}`,
      novel.description?.trim() ? `小说简介：${novel.description.trim()}` : "",
      storyInput.trim() ? `当前故事想法：${storyInput.trim()}` : "当前故事想法：暂无，按小说已知简介和世界设定裁剪。",
      `当前用途：${builderMode}`,
      novel.styleTone ? `风格倾向：${novel.styleTone}` : "",
      novel.narrativePov ? `叙事人称：${novel.narrativePov}` : "",
      novel.pacePreference ? `节奏偏好：${novel.pacePreference}` : "",
      novel.emotionIntensity ? `情绪强度：${novel.emotionIntensity}` : "",
      `世界概要：${structure.profile.summary || structure.profile.identity || "暂无"}`,
      structure.profile.coreConflict ? `世界核心冲突：${structure.profile.coreConflict}` : "",
      `可用规则：\n${formatRules(structure)}`,
      `可用势力：\n${formatForces(structure)}`,
      `可用地点：\n${formatLocations(structure)}`,
      bindingSupport.recommendedEntryPoints.length > 0
        ? `绑定建议里的入口：\n${bindingSupport.recommendedEntryPoints.map((item) => `- ${item}`).join("\n")}`
        : "",
      bindingSupport.highPressureForces.length > 0
        ? `绑定建议里的高压来源：\n${bindingSupport.highPressureForces.map((item) => `- ${item}`).join("\n")}`
        : "",
      bindingSupport.compatibleConflicts.length > 0
        ? `绑定建议里的冲突候选：\n${bindingSupport.compatibleConflicts.map((item) => `- ${item}`).join("\n")}`
        : "",
      bindingSupport.forbiddenCombinations.length > 0
        ? `绑定建议里的禁配：\n${bindingSupport.forbiddenCombinations.map((item) => `- ${item}`).join("\n")}`
        : "",
      `小说侧强制保留项：${JSON.stringify(overrides)}`,
      "请基于这本小说真正需要用到的部分进行裁剪，不要把世界全量复制下来。",
    ].filter(Boolean).join("\n\n"),
  };
}
