import { NextRequest } from 'next/server';
import { prisma } from '../../../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../auth/options';
import { LLMFactory } from '../../../../../../lib/llm/factory';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: '请先登录' }),
      { status: 401 }
    );
  }

  try {
    const { id: novelId } = params;
    const { provider, model, prompt, context: novelContext } = await request.json();

    // 检查小说是否存在且属于当前用户
    const novel = await prisma.novel.findUnique({
      where: {
        id: novelId,
        authorId: session.user.id
      }
    });

    if (!novel) {
      return new Response(
        JSON.stringify({ error: '未找到小说或无权限访问' }),
        { status: 404 }
      );
    }

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

    // 构建提示词
    const systemPrompt = `你是一位专业的小说角色设计师。请根据以下信息设计一个完整的角色。

你必须严格按照以下 JSON 格式返回角色设定，不要包含任何其他内容：

{
  "name": "角色名称（20字以内）",
  "role": "角色身份（50字以内）",
  "personality": "性格特征描述（200字以内）",
  "background": "背景故事（500字以内）",
  "development": "成长轨迹（300字以内）"
}

小说信息：
标题：${novelContext.title}
类型：${novelContext.genre}
${novelContext.description ? `简介：${novelContext.description}\n` : ''}
${novelContext.outline ? `发展走向：${novelContext.outline}\n` : ''}

注意事项：
1. 必须严格按照给定的 JSON 格式返回
2. 所有字段都必须填写，不能为空
3. 角色设定要符合小说类型和背景
4. 性格特征要立体，避免脸谱化
5. 背景故事要合理，与小说设定相符
6. 成长轨迹要体现角色的发展变化`;

    // 生成角色设定
    const response = await llm.generateRecommendation({
      systemPrompt,
      userPrompt: prompt
    });

    if (response.error) {
      throw new Error(response.error);
    }

    let characterData;
    try {
      // 清理内容中的特殊字符和格式
      const cleanContent = (response.content || '{}')
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // 移除控制字符
        .replace(/\n/g, '\\n')  // 处理换行符
        .replace(/\r/g, '\\r')  // 处理回车符
        .trim();

      // 尝试提取 JSON 部分
      const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
      const jsonContent = jsonMatch ? jsonMatch[0] : '{}';
      
      characterData = JSON.parse(jsonContent);

      // 如果生成的角色数据符合要求，保存到基础角色库
      if (characterData.name && 
          characterData.role && 
          characterData.personality && 
          characterData.background && 
          characterData.development) {
        
        // 创建基础角色
        const baseCharacter = await prisma.baseCharacter.create({
          data: {
            name: characterData.name,
            role: characterData.role,
            personality: characterData.personality,
            background: characterData.background,
            development: characterData.development,
            category: '自动生成',
            tags: `${novelContext.genre || ''}`
          }
        });

        // 创建小说角色并关联到基础角色
        const character = await prisma.character.create({
          data: {
            novelId,
            name: characterData.name,
            role: characterData.role,
            personality: characterData.personality,
            background: characterData.background,
            development: characterData.development,
            baseCharacterId: baseCharacter.id
          }
        });

        return new Response(
          JSON.stringify(character),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }
    } catch (error) {
      console.error('解析角色数据失败:', error);
      console.log('原始内容:', response.content);
      
      // 如果解析失败，使用默认值
      characterData = {
        name: '新角色',
        role: '待定',
        personality: response.content?.slice(0, 100) || '待完善',
        background: '待完善',
        development: '待完善'
      };
    }

    // 如果没有创建基础角色，则直接创建小说角色
    const character = await prisma.character.create({
      data: {
        novelId,
        name: characterData.name || '新角色',
        role: characterData.role || '待定',
        personality: characterData.personality || '待完善',
        background: characterData.background || '待完善',
        development: characterData.development || '待完善'
      }
    });

    return new Response(
      JSON.stringify(character),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('生成角色失败:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : '生成角色失败'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
} 