import { prisma } from "../../db/prisma";
import { DEFAULT_ANTI_AI_RULES, DEFAULT_STYLE_TEMPLATES } from "./defaults";
import { serializeJson } from "./helpers";

let seeded = false;

export async function ensureStyleEngineSeedData(): Promise<void> {
  if (seeded) {
    return;
  }

  for (const rule of DEFAULT_ANTI_AI_RULES) {
    await prisma.antiAiRule.upsert({
      where: { key: rule.key },
      update: {
        name: rule.name,
        type: rule.type,
        severity: rule.severity,
        description: rule.description,
        detectPatternsJson: serializeJson(rule.detectPatterns),
        rewriteSuggestion: rule.rewriteSuggestion,
        promptInstruction: rule.promptInstruction,
        autoRewrite: rule.autoRewrite,
        enabled: rule.enabled,
      },
      create: {
        key: rule.key,
        name: rule.name,
        type: rule.type,
        severity: rule.severity,
        description: rule.description,
        detectPatternsJson: serializeJson(rule.detectPatterns),
        rewriteSuggestion: rule.rewriteSuggestion,
        promptInstruction: rule.promptInstruction,
        autoRewrite: rule.autoRewrite,
        enabled: rule.enabled,
      },
    });
  }

  for (const template of DEFAULT_STYLE_TEMPLATES) {
    await prisma.styleTemplate.upsert({
      where: { key: template.key },
      update: {
        name: template.name,
        description: template.description,
        category: template.category,
        tagsJson: serializeJson(template.tags),
        applicableGenresJson: serializeJson(template.applicableGenres),
        analysisMarkdown: template.analysisMarkdown,
        narrativeRulesJson: serializeJson(template.narrativeRules),
        characterRulesJson: serializeJson(template.characterRules),
        languageRulesJson: serializeJson(template.languageRules),
        rhythmRulesJson: serializeJson(template.rhythmRules),
        defaultAntiAiRuleKeysJson: serializeJson(template.defaultAntiAiRuleKeys),
      },
      create: {
        key: template.key,
        name: template.name,
        description: template.description,
        category: template.category,
        tagsJson: serializeJson(template.tags),
        applicableGenresJson: serializeJson(template.applicableGenres),
        analysisMarkdown: template.analysisMarkdown,
        narrativeRulesJson: serializeJson(template.narrativeRules),
        characterRulesJson: serializeJson(template.characterRules),
        languageRulesJson: serializeJson(template.languageRules),
        rhythmRulesJson: serializeJson(template.rhythmRules),
        defaultAntiAiRuleKeysJson: serializeJson(template.defaultAntiAiRuleKeys),
      },
    });
  }

  seeded = true;
}
