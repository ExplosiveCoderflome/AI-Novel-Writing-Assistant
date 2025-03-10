import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/options';
import { LLMFactory } from '../../../../lib/llm/factory';

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: '请先登录' }),
      { status: 401 }
    );
  }

  try {
    const { count, provider, model, prompt, temperature, maxTokens } = await request.json();

    // 获取 API Key
    const apiKey = await prisma.aPIKey.findFirst({
      where: {
        provider,
        isActive: true,
        OR: [
          { userId: session.user.id },
          { userId: 'default' }
        ]
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    if (!apiKey) {
      throw new Error('未找到有效的 API Key，请先在设置中配置');
    }

    // 使用 LLM Factory 创建实例
    const llmFactory = LLMFactory.getInstance();
    const llm = await llmFactory.getLLMInstance({
      provider,
      apiKey: apiKey.key,
      model
    });

    // 构建系统提示词
    const systemPrompt = `你是一位专业的小说角色设计师。请根据用户的要求，设计一个完全独特的角色。每个生成的角色都必须具有独特的特征和故事背景，不能与其他角色重复。

你必须严格按照以下 JSON 格式返回角色设定，不要包含任何其他内容：

{
  "name": "角色名称（20字以内，必须独特）",
  "role": "角色身份（50字以内，避免重复的身份设定）",
  "personality": "性格特征描述（200字以内，需要独特的性格组合）",
  "background": "背景故事（500字以内，构建独特的人生经历）",
  "development": "成长轨迹（300字以内，设计独特的成长路径）",
  "appearance": "外貌描述，包括身高、体型、面容特征、穿衣风格（300字以内，避免相似的外貌特征）",
  "weaknesses": "弱点与不足，包括人际关系、情感问题、自我冲突等（300字以内，设计独特的缺陷和困扰）",
  "interests": "兴趣爱好，包括个人特长、休闲活动等（200字以内，选择独特的兴趣组合）",
  "keyEvents": "影响角色成长的重要事件（300字以内，创造独特的关键事件）",
  "category": "角色分类（主角/反派/配角）",
  "tags": "标签，用逗号分隔（例如：正义,勇敢,智慧，需要独特的标签组合）"
}

注意事项：
1. 必须严格按照给定的 JSON 格式返回
2. 所有字段都必须填写，不能为空
3. 每个生成的角色必须完全独特，不能与其他角色有明显相似之处
4. 角色设定要立体，避免脸谱化
5. 背景故事要合理，富有细节，且具有独特性
6. 成长轨迹要体现角色的独特发展变化
7. 外貌描述要具体且独特，避免常见或重复的特征
8. 弱点与不足要合理且有深度，体现角色的独特困扰
9. 兴趣爱好要独特且符合角色性格
10. 重要事件要独特且与背景故事和成长轨迹呼应
11. 分类必须是：主角、反派、配角之一
12. 标签要准确且独特地反映角色特点，避免使用过于普遍的标签
13. 即使角色之间有关联，也要保持每个角色的独特性和完整性
14. 性格特征要有层次感，避免简单的好人坏人二分法
15. 每个角色都应该有自己独特的矛盾点和成长动力`;

    // 批量生成角色
    const generatedCharacters = [];
    
    // 顺序生成角色
    for (let i = 0; i < count; i++) {
      // 构建已生成角色的描述
      const previousCharactersDesc = generatedCharacters.map((char, index) => `
已生成的第 ${index + 1} 个角色：
姓名：${char.name}
身份：${char.role}
性格：${char.personality}
背景：${char.background}
特点：${char.tags}
`).join('\n');

      // 为当前角色添加独特性要求
      const uniquePrompt = `${prompt}\n\n${
        previousCharactersDesc ? 
        `已生成的角色信息：\n${previousCharactersDesc}\n\n` : 
        ''
      }这是第 ${i + 1} 个角色，请确保：
1. 该角色与上述已生成的所有角色都有明显区别
2. 性格特征要形成独特的组合，避免与已有角色重复
3. 背景故事要有独特的转折点，与已有角色形成差异
4. 成长经历要有不同的挑战和考验
5. 要有独特的价值观和行为模式，避免与已有角色相似
6. 外貌特征要有明显区别，避免相似的描述
7. 兴趣爱好要形成差异化
8. 如果与已有角色有关联，必须是独特和有意义的关联，而不是简单的重复`;

      const response = await llm.generateRecommendation({
        systemPrompt,
        userPrompt: uniquePrompt,
        temperature: temperature ?? 0.7,
        maxTokens: maxTokens ?? 2000
      });

      if (!response || !response.content) {
        throw new Error('AI 未返回有效的响应内容');
      }

      let characterData;
      try {
        // 清理内容中的特殊字符和格式
        const cleanContent = response.content
          .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // 移除控制字符
          .replace(/\n/g, ' ')  // 将换行符替换为空格
          .replace(/\r/g, ' ')  // 将回车符替换为空格
          .replace(/\s+/g, ' ') // 将多个空格合并为一个
          .trim();

        // 尝试提取 JSON 部分
        const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('未找到有效的 JSON 内容');
        }

        const jsonContent = jsonMatch[0];
        characterData = JSON.parse(jsonContent);

        // 验证并清理数据
        const validatedData = {
          name: String(characterData.name || '').slice(0, 20) || '新角色',
          role: String(characterData.role || '').slice(0, 50) || '待定',
          personality: String(characterData.personality || '').slice(0, 200) || '待完善',
          background: String(characterData.background || '').slice(0, 500) || '待完善',
          development: String(characterData.development || '').slice(0, 300) || '待完善',
          appearance: String(characterData.appearance || '').slice(0, 300) || '待完善',
          weaknesses: String(characterData.weaknesses || '').slice(0, 300) || '待完善',
          interests: String(characterData.interests || '').slice(0, 200) || '待完善',
          keyEvents: Array.isArray(characterData.keyEvents) 
            ? characterData.keyEvents.join('\n') 
            : String(characterData.keyEvents || '').slice(0, 300) || '待完善',
          category: ['主角', '反派', '配角'].includes(String(characterData.category || '')) 
            ? String(characterData.category) 
            : '配角',
          tags: String(characterData.tags || '').slice(0, 100) || ''
        };

        // 创建新角色
        const newCharacter = await prisma.baseCharacter.create({
          data: validatedData
        });

        // 将新生成的角色添加到列表中
        generatedCharacters.push(newCharacter);
      } catch (error) {
        console.error('处理 AI 响应失败:', error);
        throw new Error('生成角色数据处理失败');
      }
    }

    return NextResponse.json(generatedCharacters);
  } catch (error) {
    console.error("批量生成角色失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "批量生成角色失败" },
      { status: 500 }
    );
  }
} 