import { NextRequest, NextResponse } from 'next/server';
import { getLLMProvider } from '../../../../lib/llm-provider';
import { prisma } from '../../../../lib/prisma';
import { createParser } from 'eventsource-parser';

export const maxDuration = 300; // 设置更长的超时时间，因为评分可能需要更多时间

export async function POST(req: NextRequest) {
  try {
    const {
      formulaId,
      generatedContent,
      originalInput,
      isGenerationMode,
      provider = 'deepseek',
      model = 'deepseek-chat',
      temperature = 0.3,
    } = await req.json();

    if (!formulaId) {
      return NextResponse.json({ success: false, error: '未提供写作公式ID' }, { status: 400 });
    }

    if (!generatedContent) {
      return NextResponse.json({ success: false, error: '未提供生成内容' }, { status: 400 });
    }

    // 获取写作公式
    const formula = await prisma.writingFormula.findUnique({
      where: { id: formulaId },
    });

    if (!formula) {
      return NextResponse.json({ success: false, error: '未找到写作公式' }, { status: 404 });
    }

    // 构建评分提示词
    const scorePrompt = await buildScorePrompt(formula, generatedContent, originalInput, isGenerationMode);

    // 获取LLM提供商
    const llmProvider = getLLMProvider(provider);
    if (!llmProvider) {
      return NextResponse.json({ success: false, error: `不支持的提供商: ${provider}` }, { status: 400 });
    }

    // 调用LLM进行评分
    const scoreResult = await llmProvider.generateWithFunction(
      {
        model,
        temperature,
        messages: [
          {
            role: 'system',
            content: scorePrompt.systemPrompt,
          },
          {
            role: 'user',
            content: scorePrompt.userPrompt,
          },
        ],
        functions: [
          {
            name: 'score_content',
            description: '为生成的内容根据写作公式提供评分和反馈',
            parameters: {
              type: 'object',
              properties: {
                total_score: {
                  type: 'number',
                  description: '总体评分，范围为0-100',
                },
                score_items: {
                  type: 'array',
                  description: '各评分项目',
                  items: {
                    type: 'object',
                    properties: {
                      name: {
                        type: 'string',
                        description: '评分项目名称',
                      },
                      score: {
                        type: 'number',
                        description: '该项目的评分，范围为0-10',
                      },
                      comment: {
                        type: 'string',
                        description: '对该项目的评价和建议',
                      },
                    },
                    required: ['name', 'score', 'comment'],
                  },
                },
                overall_feedback: {
                  type: 'string',
                  description: '整体评价',
                },
                improvement_suggestions: {
                  type: 'array',
                  description: '改进建议',
                  items: {
                    type: 'string',
                  },
                },
              },
              required: ['total_score', 'score_items', 'overall_feedback', 'improvement_suggestions'],
            },
          },
        ],
        function_call: { name: 'score_content' },
        max_tokens: 2048,
      }
    );

    // 检查是否有function_call结果
    if (scoreResult?.function_call?.arguments) {
      try {
        const scoreData = JSON.parse(scoreResult.function_call.arguments);
        return NextResponse.json({
          success: true,
          scoreData,
          fullResponse: scoreResult.content || '',
        });
      } catch (e) {
        console.error('解析评分JSON失败:', e);
      }
    }

    // 如果没有function_call结果或解析失败，尝试从content中提取评分
    if (scoreResult?.content) {
      const scoreData = extractScoreFromContent(scoreResult.content, isGenerationMode);
      if (scoreData) {
        return NextResponse.json({
          success: true,
          scoreData,
          fullResponse: scoreResult.content,
        });
      }
    }

    // 如果所有尝试都失败
    return NextResponse.json({ 
      success: false, 
      error: '评分失败，无法提取有效的评分结果',
      debug: scoreResult
    }, { status: 500 });

  } catch (error) {
    console.error('评分API错误:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '评分过程中出现未知错误',
    }, { status: 500 });
  }
}

// 从内容中提取评分信息
function extractScoreFromContent(content: string, isGenerationMode: boolean): any {
  try {
    // 尝试提取总分
    const totalScoreMatch = content.match(/总分[：:]\s*(\d+\.?\d*)\/100/);
    const totalScore = totalScoreMatch ? parseFloat(totalScoreMatch[1]) : 0;

    // 尝试提取各项评分
    const scoreItems = [];
    const scoringItemPatterns = [
      { name: isGenerationMode ? '风格符合度' : '风格符合度', pattern: /风格符合度[（(（](\d+\.?\d*)\/10[)）]/ },
      { name: isGenerationMode ? '主题相关性' : '原意保留', pattern: isGenerationMode ? /主题相关性[（(（](\d+\.?\d*)\/10[)）]/ : /原意保留[（(（](\d+\.?\d*)\/10[)）]/ },
      { name: '语言流畅度', pattern: /语言流畅度[（(（](\d+\.?\d*)\/10[)）]/ },
      { name: '创意性', pattern: /创意性[（(（](\d+\.?\d*)\/10[)）]/ },
      { name: '整体印象', pattern: /整体印象[（(（](\d+\.?\d*)\/10[)）]/ }
    ];

    // 尝试从Python格式中提取
    const pythonFormatRegex = new RegExp("score_content\\(\\s*([^)]+)\\)", "m");
    const pythonFormatMatch = content.match(pythonFormatRegex);
    if (pythonFormatMatch) {
      const params = pythonFormatMatch[1];
      
      // 提取参数和值
      const styleMatch = params.match(/style\w*\s*=\s*(\d+\.?\d*)/);
      const relevanceMatch = params.match(/(theme_relevance|relevance|meaning)\s*=\s*(\d+\.?\d*)/);
      const languageMatch = params.match(/language\w*\s*=\s*(\d+\.?\d*)/);
      const creativityMatch = params.match(/creativ\w*\s*=\s*(\d+\.?\d*)/);
      const impressionMatch = params.match(/(overall_impression|impression)\s*=\s*(\d+\.?\d*)/);

      if (styleMatch) {
        scoreItems.push({
          name: '风格符合度',
          score: parseFloat(styleMatch[1]),
          comment: extractCommentForItem(content, '风格符合度')
        });
      }

      if (relevanceMatch) {
        scoreItems.push({
          name: isGenerationMode ? '主题相关性' : '原意保留',
          score: parseFloat(relevanceMatch[2]),
          comment: extractCommentForItem(content, isGenerationMode ? '主题相关性' : '原意保留')
        });
      }

      if (languageMatch) {
        scoreItems.push({
          name: '语言流畅度',
          score: parseFloat(languageMatch[1]),
          comment: extractCommentForItem(content, '语言流畅度')
        });
      }

      if (creativityMatch) {
        scoreItems.push({
          name: '创意性',
          score: parseFloat(creativityMatch[1]),
          comment: extractCommentForItem(content, '创意性')
        });
      }

      if (impressionMatch) {
        scoreItems.push({
          name: '整体印象',
          score: parseFloat(impressionMatch[2]),
          comment: extractCommentForItem(content, '整体印象')
        });
      }
    } else {
      // 如果没有Python格式，尝试常规格式
      for (const item of scoringItemPatterns) {
        const match = content.match(item.pattern);
        if (match) {
          const score = parseFloat(match[1]);
          const comment = extractCommentForItem(content, item.name);
          scoreItems.push({
            name: item.name,
            score,
            comment
          });
        }
      }
    }

    // 提取整体评价
    let overallFeedback = '';
    const overallSection = content.match(/整体评价[：:]\s*([\s\S]*?)(?=\n\n|改进建议|$)/);
    if (overallSection) {
      overallFeedback = overallSection[1].trim();
    }

    // 提取改进建议
    const improvementSuggestions = [];
    const suggestionSection = content.match(/改进建议[：:]\s*([\s\S]*?)(?=\n\n|$)/);
    if (suggestionSection) {
      const suggestions = suggestionSection[1].trim();
      const suggestionItems = suggestions.split(/\d+\.\s*/).filter(Boolean);
      improvementSuggestions.push(...suggestionItems.map(s => s.trim()));
    } else {
      // 尝试使用数字列表提取
      const listRegex = new RegExp("改进建议[\\s\\S]*?((?:\\d+\\.\\s*[^\\n]+\\n?)+)", "m");
      const listMatch = content.match(listRegex);
      if (listMatch) {
        const suggestionList = listMatch[1].split(/\n/).filter(line => /^\d+\./.test(line));
        for (const suggestion of suggestionList) {
          const cleanSuggestion = suggestion.replace(/^\d+\.\s*/, '').trim();
          if (cleanSuggestion) {
            improvementSuggestions.push(cleanSuggestion);
          }
        }
      }
    }

    // 如果没有提取到改进建议，尝试从内容中查找关键字
    if (improvementSuggestions.length === 0) {
      const suggestionKeywords = ['建议', '改进', '可以尝试', '可以加强', '可以增加'];
      const contentLines = content.split('\n');
      for (const line of contentLines) {
        for (const keyword of suggestionKeywords) {
          if (line.includes(keyword) && line.length < 100) {
            const cleanLine = line.trim();
            if (cleanLine && !improvementSuggestions.includes(cleanLine)) {
              improvementSuggestions.push(cleanLine);
            }
          }
        }
      }
    }

    // 构建结果
    return {
      total_score: totalScore,
      score_items: scoreItems,
      overall_feedback: overallFeedback,
      improvement_suggestions: improvementSuggestions
    };
  } catch (error) {
    console.error('从内容提取评分失败:', error);
    return null;
  }
}

// 从内容中提取特定项目的评论
function extractCommentForItem(content: string, itemName: string): string {
  // 在内容中查找项目名和相关描述
  const regex = new RegExp(`${itemName}[（(（]\\d+\\.?\\d*\\/10[)）]\\s*([\\s\\S]*?)(?=\\d+\\.\\s*\\*\\*|$)`, 'i');
  const match = content.match(regex);
  
  if (match && match[1]) {
    return match[1].trim().replace(/^[:-]\s*/, '');
  }
  
  // 尝试查找段落
  const paragraphRegex = new RegExp(`\\*\\*${itemName}\\*\\*[：:]*([\\s\\S]*?)(?=\\*\\*|$)`, 'i');
  const paragraphMatch = content.match(paragraphRegex);
  
  if (paragraphMatch && paragraphMatch[1]) {
    return paragraphMatch[1].trim();
  }
  
  return '';
}

// 构建评分提示词
async function buildScorePrompt(formula: any, generatedContent: string, originalInput: string, isGenerationMode: boolean) {
  let formulaContent = '';

  if (formula.content) {
    formulaContent = formula.content;
  } else if (formula.analysis) {
    const analysis = formula.analysis;
    formulaContent = `写作风格概述：
${analysis.summary || '未提供'}

写作技巧：
${JSON.stringify(analysis.techniques || [], null, 2)}

风格指南：
${JSON.stringify(analysis.styleGuide || {}, null, 2)}

应用提示：
${JSON.stringify(analysis.applicationTips || [], null, 2)}`;
  } else if (formula.sourceText) {
    formulaContent = `源文本：${formula.sourceText}`;
  }

  // 构建针对不同模式的系统提示词
  const systemPrompt = `你是一位专业的文学评论家，擅长评估文本是否符合特定的写作公式和风格。
你的任务是分析用户提供的内容，判断它与给定写作公式的符合程度，并提供详细的评分和反馈。

评分时，你应考虑以下几个方面：
1. 风格符合度：内容是否符合写作公式描述的风格特点
2. ${isGenerationMode ? '主题相关性：生成的内容是否紧扣用户提供的主题/想法' : '原意保留：改写后的内容是否保留了原文的核心意思'}
3. 语言流畅度：语言是否自然、流畅，没有明显的生硬或不通顺之处
4. 创意性：内容是否展现了创意和独特的表达方式
5. 整体印象：作为一个整体，内容的质量和吸引力如何

每个方面的评分范围为0-10分，总分为这些评分的加权平均值（满分100分）。
请提供客观、具体、有建设性的反馈，并给出改进建议。

请使用score_content函数返回你的评分，格式如下：
score_content(
  style_conformity=8.5,  # 风格符合度
  ${isGenerationMode ? 'theme_relevance=8.0,   # 主题相关性' : 'meaning_preservation=8.0,   # 原意保留'}
  language_fluency=9.0,  # 语言流畅度
  creativity=8.5,        # 创意性
  overall_impression=8.0 # 整体印象
)

在之后的评论中，请详细说明每个评分的理由和具体的改进建议。`;

  // 构建用户提示词
  const userPrompt = `请对以下${isGenerationMode ? '根据主题/想法生成的内容' : '改写后的内容'}进行评分，判断它是否符合写作公式的要求。

# 写作公式
${formulaContent}

# ${isGenerationMode ? '用户提供的主题/想法' : '原始文本'}
${originalInput}

# ${isGenerationMode ? '生成的内容' : '改写后的内容'}
${generatedContent}

请分析这${isGenerationMode ? '生成的内容' : '改写后的内容'}是否符合写作公式的风格和要求，并使用score_content函数提供您的评分和详细反馈。`;

  return { systemPrompt, userPrompt };
} 