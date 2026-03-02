import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { getApiKey } from '../../../../lib/api-key';
import { LLMFactory } from '../../../llm/factory';
import { LLMProviderConfig } from '../../../types/llm';

export const maxDuration = 300;

interface ScoreItem {
  name: string;
  score: number;
  comment: string;
}

interface ScoreData {
  total_score: number;
  score_items: ScoreItem[];
  overall_feedback: string;
  improvement_suggestions: string[];
}

function getScoreItemNames(isGenerationMode: boolean): string[] {
  return [
    '风格符合度',
    isGenerationMode ? '主题相关性' : '原意保留',
    '语言流畅度',
    '创意性',
    '整体印象',
  ];
}

function normalizeScoreData(data: Partial<ScoreData>, isGenerationMode: boolean): ScoreData {
  const scoreItems = Array.isArray(data.score_items) ? data.score_items : [];
  const normalizedItems = scoreItems
    .map((item) => ({
      name: typeof item?.name === 'string' ? item.name : '',
      score: typeof item?.score === 'number' ? item.score : Number(item?.score || 0),
      comment: typeof item?.comment === 'string' ? item.comment : '',
    }))
    .filter((item) => item.name);

  const filledItemNames = new Set(normalizedItems.map((item) => item.name));
  for (const requiredName of getScoreItemNames(isGenerationMode)) {
    if (!filledItemNames.has(requiredName)) {
      normalizedItems.push({ name: requiredName, score: 0, comment: '' });
    }
  }

  return {
    total_score:
      typeof data.total_score === 'number' ? data.total_score : Number(data.total_score || 0),
    score_items: normalizedItems,
    overall_feedback: typeof data.overall_feedback === 'string' ? data.overall_feedback : '',
    improvement_suggestions: Array.isArray(data.improvement_suggestions)
      ? data.improvement_suggestions.map((item) => String(item))
      : [],
  };
}

function extractJsonString(content: string): string | null {
  const fenced = content.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return content.slice(firstBrace, lastBrace + 1).trim();
  }

  return null;
}

function extractScoreFromJson(content: string, isGenerationMode: boolean): ScoreData | null {
  try {
    const jsonString = extractJsonString(content);
    if (!jsonString) {
      return null;
    }

    const parsed = JSON.parse(jsonString) as Partial<ScoreData>;
    return normalizeScoreData(parsed, isGenerationMode);
  } catch {
    return null;
  }
}

function extractScoreFromContent(content: string, isGenerationMode: boolean): ScoreData | null {
  try {
    const totalScoreMatch = content.match(/总分[：:]\s*(\d+\.?\d*)\s*\/?\s*100?/);
    const totalScore = totalScoreMatch ? Number(totalScoreMatch[1]) : 0;

    const scoreItems: ScoreItem[] = [];
    for (const itemName of getScoreItemNames(isGenerationMode)) {
      const regex = new RegExp(`${itemName}[（(]\\s*(\\d+\\.?\\d*)\\s*\\/\\s*10[)）]`);
      const match = content.match(regex);
      if (match) {
        scoreItems.push({
          name: itemName,
          score: Number(match[1]),
          comment: '',
        });
      }
    }

    const feedbackMatch = content.match(/整体评价[：:]\s*([\s\S]*?)(?=\n\s*改进建议|$)/);
    const overallFeedback = feedbackMatch?.[1]?.trim() || '';

    const suggestions: string[] = [];
    const suggestionMatches = [...content.matchAll(/^\s*[-\d.、]+\s*(.+)$/gm)];
    for (const match of suggestionMatches) {
      if (match[1]?.trim()) {
        suggestions.push(match[1].trim());
      }
    }

    return normalizeScoreData(
      {
        total_score: totalScore,
        score_items: scoreItems,
        overall_feedback: overallFeedback,
        improvement_suggestions: suggestions,
      },
      isGenerationMode
    );
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const {
      formulaId,
      generatedContent,
      originalInput = '',
      isGenerationMode = false,
      provider = 'deepseek',
      model = 'deepseek-chat',
      temperature = 0.3,
    } = await req.json();

    if (!formulaId) {
      return NextResponse.json(
        { success: false, error: '未提供写作公式ID' },
        { status: 400 }
      );
    }

    if (!generatedContent) {
      return NextResponse.json(
        { success: false, error: '未提供生成内容' },
        { status: 400 }
      );
    }

    const formula = await prisma.writingFormula.findUnique({
      where: { id: formulaId },
    });

    if (!formula) {
      return NextResponse.json(
        { success: false, error: '未找到写作公式' },
        { status: 404 }
      );
    }

    const scorePrompt = buildScorePrompt(
      formula,
      generatedContent,
      originalInput,
      Boolean(isGenerationMode)
    );

    const apiKey = await getApiKey(provider);
    const providerConfig: LLMProviderConfig = {
      getApiKey: async () => apiKey,
      model,
      temperature,
      maxTokens: 2048,
    };

    const llmFactory = LLMFactory.getInstance();
    llmFactory.setConfig({
      defaultProvider: provider,
      providers: {
        [provider]: providerConfig,
      },
    });

    const llmResult = await llmFactory.generateRecommendation(
      {
        systemPrompt: scorePrompt.systemPrompt,
        userPrompt: scorePrompt.userPrompt,
        model,
        temperature,
        maxTokens: 2048,
      },
      provider
    );

    if (llmResult.error || !llmResult.content) {
      return NextResponse.json(
        {
          success: false,
          error: llmResult.error || '评分失败，模型未返回有效内容',
        },
        { status: 500 }
      );
    }

    const scoreData =
      extractScoreFromJson(llmResult.content, Boolean(isGenerationMode)) ||
      extractScoreFromContent(llmResult.content, Boolean(isGenerationMode));

    if (scoreData) {
      return NextResponse.json({
        success: true,
        scoreData,
        fullResponse: llmResult.content,
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: '评分失败，无法提取有效的评分结果',
        debug: llmResult.content,
      },
      { status: 500 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '评分过程中出现未知错误',
      },
      { status: 500 }
    );
  }
}

function buildScorePrompt(
  formula: {
    content?: string | null;
    analysis?: unknown;
    sourceText?: string | null;
  },
  generatedContent: string,
  originalInput: string,
  isGenerationMode: boolean
) {
  let formulaContent = '';

  if (formula.content) {
    formulaContent = formula.content;
  } else if (formula.analysis) {
    formulaContent = `分析结果：\n${JSON.stringify(formula.analysis, null, 2)}`;
  } else if (formula.sourceText) {
    formulaContent = `源文本：\n${formula.sourceText}`;
  }

  const secondDimension = isGenerationMode ? '主题相关性' : '原意保留';

  const systemPrompt = `你是一位专业文学编辑，需要给文本打分并输出严格 JSON。

评分维度（每项 0-10）：
1. 风格符合度
2. ${secondDimension}
3. 语言流畅度
4. 创意性
5. 整体印象

总分 total_score 为 0-100。

你必须仅返回一个 JSON 对象，不要 Markdown，不要解释文字，结构如下：
{
  "total_score": 0,
  "score_items": [
    { "name": "风格符合度", "score": 0, "comment": "" },
    { "name": "${secondDimension}", "score": 0, "comment": "" },
    { "name": "语言流畅度", "score": 0, "comment": "" },
    { "name": "创意性", "score": 0, "comment": "" },
    { "name": "整体印象", "score": 0, "comment": "" }
  ],
  "overall_feedback": "",
  "improvement_suggestions": ["", ""]
}`;

  const userPrompt = `请基于以下内容进行评分。

# 写作公式
${formulaContent}

# ${isGenerationMode ? '用户主题/想法' : '原始文本'}
${originalInput}

# ${isGenerationMode ? '生成内容' : '改写内容'}
${generatedContent}`;

  return { systemPrompt, userPrompt };
}
