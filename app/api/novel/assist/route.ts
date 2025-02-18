/*
 * @LastEditors: biz
 */
import { NextRequest, NextResponse } from 'next/server';
import { AIAssistRequest, AIAssistResponse } from '../types';

const SYSTEM_PROMPTS = {
  plot: "你是一位专业的小说写作顾问。请根据以下内容提供故事发展走向的建议，使故事更加引人入胜：",
  character: "你是一位角色发展专家。请根据以下内容为角色提供性格特征和发展建议：",
  style: "你是一位写作风格专家。请根据以下内容提供写作风格改进建议：",
  optimization: "你是一位文本优化专家。请根据以下内容提供具体的文本修改建议，使表达更加优美：",
};

export async function POST(request: NextRequest) {
  try {
    const { type, content, context }: AIAssistRequest = await request.json();

    // TODO: Replace with actual LLM API call
    const mockResponse: AIAssistResponse = {
      suggestions: [
        "Suggestion 1: Consider adding more detailed descriptions to make the scene more vivid.",
        "Suggestion 2: Think about introducing some suspense elements to increase reader anticipation.",
        "Suggestion 3: Deepen the conflicts between characters to make the plot more compact.",
      ],
      explanation: "These suggestions are aimed at improving the overall quality and readability of the story.",
    };

    return NextResponse.json(mockResponse);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to generate AI suggestions' },
      { status: 500 }
    );
  }
}