import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';
import { prisma } from '../../../../lib/prisma';
import { LLMFactory } from '../../../llm/factory';
import { LLMDBConfig, llmConfig } from '../../../config/llm';
import { LLMProviderConfig } from '../../../types/llm';
import { NovelGenre } from '../../novel/types';

type LLMProvider = keyof Omit<LLMDBConfig, 'defaultProvider'>;

// 生成动态提示词函数
const generateTitlePrompt = (titleCount: number, genre?: { id: string; name: string; description?: string; }) => {
  let genreInfo = '';
  
  if (genre) {
    genreInfo = `
【目标小说类型】
类型名称: ${genre.name}
${genre.description ? `类型描述: ${genre.description}` : ''}

请确保生成的标题与此类型相符合，应当体现该类型的风格与特点。`;
  }
  
  return `你是一个具备平台流量预测能力的网文标题AI，需掌握以下核心能力：

【平台基因解码】
1. 起点模式：
   - 文学性词库：使用"纪元/命途/诡境/道则"等厚重词汇
   - 世界观暗示：通过标题暗示宏大设定（如《宿命之环》《赤心巡天》）
   - 适当留白：保留想象空间（《道诡异仙》优于《我变成了诡异仙人》）

2. 番茄模式：
   - 冲突前置：首5字必须出现爆点（《被夺骨后我屠了整个仙界》）
   - 身份锚点：强化职业/状态关键词（外卖员/保安/癌症患者）
   - 数据化表达：嵌入"999级/秒杀/暴击"等游戏化词汇

【爆款元素库】
* 结构模版：
  - 反常识组合：《修仙，但物理飞升》
  - 量化冲击：《百万阴兵，拜我为人间阎罗》
  - 系统通报体：《全球播报：龙国秘境降临昆仑山》
  
* 热点关键词：
  ▏直播▏守夜人▏规则怪谈▏殡葬师▏赛博▏  
${genreInfo}

【动态调控规则】
1. 词频控制系统：
   - 每5个标题需包含：
     ■ 1个数字量化标题 
     ■ 1个职业身份标题
     ■ 1个世界观隐喻标题

2. 时代过滤网：
   - 禁用词库更新至2024Q3：
     ["赘婿","战神","兵王","冷艳总裁"] 

3. 点击率算法：
   - 基于历史大数据模型预测点击表现
   - 根据平台实际表现权重：新奇度40%+热点契合度30%+目标用户偏好30%
   - 点击率评分：60%以下(低效)，60%-80%(中效)，80%以上(高效)

# 强化控制参数 - 严格结构多样性与绝对防重复要求

1. 绝对防重复机制（最高优先级，任何情况下必须执行）：
   - 严禁生成任何完全相同的标题 —— 必须在生成每个新标题前检查之前所有已生成标题
   - 强制保持标题中词语组合的唯一性 —— 不允许两个标题使用完全相同的核心词语组合
   - 提高记忆：在生成每个新标题前，你必须回顾前面所有已生成的标题，确保新标题与之前所有标题差异度≥30%
   - 如果生成标题数量超过15个，必须在每第15个标题后进行完整回顾，确保后续标题不重复前面内容

2. 结构多样性要求（严格执行）：
   - 严格定义：标题结构指"句式格式+关键词位置+标点使用"
   - 连续2个标题不得使用相同结构模式
   - 明确禁止连续生成"[名词]：我在[地点/世界]当/做[身份/动作]"格式的标题
   - 强制每3个标题中至少使用2种不同句式结构
   - 当检测到结构趋同时，必须从以下结构中选择一种完全不同的：
     ■ 疑问句式：《谁说修真不能用物理？》
     ■ 反转句式：《我不是暴君，我只是...》
     ■ 直陈句式：《天降神书改写命运》
     ■ 对偶句式：《修仙靠感情，渡劫用物理》
   - 强制限制冒号使用：所有标题中，使用冒号的标题不得超过40%
   - 强制限制特定句式重复：同一种句式结构（如疑问句或反转句）在所有标题中出现次数不得超过3次

3. 关键词分散与变异要求（严格执行）：
   - 即使输入关键词很具体（如"无限流"），也不得在所有标题中重复使用相同词语开头
   - 强制规定：
     a) 任何单一关键词（如"无限"）在标题开头的使用不得超过20%
     b) 如用户输入的关键词包含多个词（如"无限流"），必须拆分使用，避免总是同时出现
     c) 关键词的同义词（如"无限"可用"轮回/循环/多元/诸天/万界"等替代）使用比例至少占50%
     d) 必须包含至少5个完全不使用用户输入关键词及其同义词的创新标题
   - 标题开头词汇强制多样化：连续3个标题禁止使用相同词语开头

4. 多元化保障（绝对要求）：
   - 在生成的${titleCount}个标题中必须包含至少5种不同风格
   - 标题总数不足10个时也要确保至少3种不同风格
   - 风格均衡分布，任何一种风格不超过总数30%
   - 对于超过15个的标题生成任务，必须确保包含至少一个"完全出人意料"的标题形式

【任务要求】
根据用户提供的关键词（题材/风格/核心梗），生成${titleCount}个有吸引力的小说标题。
每个标题后面附带一个预估点击率百分比（1-100%）。

要求：
1. 标题要简洁有力，通常在10个字以内
2. 标题要符合中文网文风格，有吸引力
3. 标题要与提供的关键词高度相关
4. 返回格式必须是JSON数组，每个元素包含title和clickRate两个字段
5. 不要有任何额外的解释或说明，只返回JSON数组

示例输出格式：
[
  {"title": "星域破晓", "clickRate": 85},
  {"title": "苍穹之巅", "clickRate": 78},
  ...
]`;
};

// 爆款改编提示词函数
const generateAdaptationPrompt = (titleCount: number, genre?: { id: string; name: string; description?: string; }) => {
  let genreInfo = '';
  
  if (genre) {
    genreInfo = `
【目标小说类型】
类型名称: ${genre.name}
${genre.description ? `类型描述: ${genre.description}` : ''}

请确保生成的标题与此类型相符合，应当体现该类型的风格与特点。`;
  }

  return `你是一个专业的小说标题改编专家，擅长将经典小说标题改编成新的吸引人的变体。
根据用户提供的经典小说标题，生成${titleCount}个变异版本的标题，保持原标题的风格和感觉，但创造新的表达。
每个标题后面附带一个预估点击率百分比（1-100%）。
${genreInfo}

# 强化控制参数 - 严格结构多样性与绝对防重复要求

1. 绝对防重复机制（最高优先级）：
   - 严禁生成任何完全相同的标题 —— 必须在生成每个新标题前检查之前所有已生成标题
   - 强制保持标题中词语组合的唯一性 —— 不允许两个标题使用完全相同的核心词语组合
   - 提高记忆：在生成每个新标题前，必须回顾前面所有已生成的标题，确保新标题与之前所有标题差异度≥30%
   - 如果生成标题数量超过15个，必须在每第15个标题后进行完整回顾，确保后续标题不重复前面内容

2. 结构多样性要求（严格执行）：
   - 严格定义：标题结构指"句式模式+词法结构+标点使用"
   - 连续2个标题不得使用相同结构
   - 每3个标题必须使用完全不同的表达方式
   - 显式禁止：超过20%的标题使用同一种结构模式
   - 强制限制冒号使用：所有标题中，使用冒号的标题不得超过40%
   - 强制限制特定句式重复：同一种句式结构（如疑问句或反转句）在所有标题中出现次数不得超过3次

3. 变体多样性指标（必须严格遵守）：
   - 在${titleCount}个标题中，必须均衡使用以下所有变体类型：
     ■ 直接同义词替换型（如"斗破苍穹"→"战碎天穹"）- 不超过20%
     ■ 主题延伸型（如"斗破苍穹"→"天际神战"）- 至少30%
     ■ 观点转换型（如"斗破苍穹"→"苍穹之主"）- 至少20%
     ■ 结构重组型（如"斗破苍穹"→"苍穹破碎之日"）- 至少20%
     ■ 问句转化型（如"斗破苍穹"→"谁能撕裂这片天穹？"）- 至少包含2个但不超过3个

4. 强制创新要求：
   - 必须包含至少3个完全出人意料的改编方式
   - 至少5种不同句式结构
   - 禁止连续使用相同词汇开头
   - 对于超过15个的标题生成任务，必须确保包含至少一个"完全突破框架"的标题形式

要求：
1. 新标题要保持原标题的风格和感觉
2. 新标题要有创新性，不能与原标题过于相似
3. 标题要简洁有力，通常在10个字以内
4. 返回格式必须是JSON数组，每个元素包含title和clickRate两个字段
5. 不要有任何额外的解释或说明，只返回JSON数组

示例输出格式：
[
  {"title": "星域破晓", "clickRate": 85},
  {"title": "苍穹之巅", "clickRate": 78},
  ...
]`;
};

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: '请先登录' },
      { status: 401 }
    );
  }

  try {
    const { 
      provider = 'deepseek', 
      model = 'deepseek-chat', 
      keywords, 
      originalTitle, 
      mode = 'generate',
      temperature,
      maxTokens,
      titleCount = 20,
      genre = null
    } = await request.json();

    // 限制标题数量在合理范围内
    const normalizedTitleCount = Math.min(Math.max(Number(titleCount) || 20, 5), 50);

    if (!provider || !model || (mode === 'generate' && !keywords) || (mode === 'adapt' && !originalTitle)) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数' },
        { status: 400 }
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
      return NextResponse.json(
        { success: false, error: '未找到有效的 API Key' },
        { status: 404 }
      );
    }

    // 创建 LLM 实例
    const llmFactory = LLMFactory.getInstance();
    const providerKey = provider as LLMProvider;
    
    // 创建配置对象
    const newConfig: LLMDBConfig = {
      defaultProvider: llmConfig.defaultProvider,
    };
    
    // 复制原有配置
    Object.keys(llmConfig).forEach(key => {
      if (key !== 'defaultProvider') {
        newConfig[key] = llmConfig[key];
      }
    });
    
    // 为大标题数量调整maxTokens
    const calculatedMaxTokens = maxTokens ?? Math.max(2000, normalizedTitleCount * 100);
    
    // 更新当前provider的配置
    const providerConfig = llmConfig[providerKey] as LLMProviderConfig;
    if (providerConfig) {
      newConfig[providerKey] = {
        ...providerConfig,
        getApiKey: async () => apiKey.key,
        model,
        temperature: temperature ?? 0.8, 
        maxTokens: calculatedMaxTokens, 
      };
    }
    
    llmFactory.setConfig(newConfig);

    // 根据模式和标题数量选择不同的提示词
    const systemPrompt = mode === 'generate' 
      ? generateTitlePrompt(normalizedTitleCount, genre) 
      : generateAdaptationPrompt(normalizedTitleCount, genre);
    
    const userPrompt = mode === 'generate'
      ? `请根据以下关键词生成${normalizedTitleCount}个吸引人的小说标题：${keywords}`
      : `请根据以下经典小说标题生成${normalizedTitleCount}个变异版本：${originalTitle}`;

    // 生成内容
    const response = await llmFactory.generateRecommendation({
      systemPrompt,
      userPrompt,
      model,
      temperature: temperature ?? 0.8,
      maxTokens: calculatedMaxTokens,
    }, provider);

    if (response.error) {
      return NextResponse.json(
        { success: false, error: response.error },
        { status: 500 }
      );
    }

    // 解析返回的JSON
    try {
      const titles = JSON.parse(response.content || '[]');
      return NextResponse.json({
        success: true,
        titles
      });
    } catch (error) {
      console.error('解析标题JSON失败:', error, response.content);
      return NextResponse.json(
        { success: false, error: '解析生成的标题失败' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('生成标题失败:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : '生成标题失败' 
      },
      { status: 500 }
    );
  }
} 