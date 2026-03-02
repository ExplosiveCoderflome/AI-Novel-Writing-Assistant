"use client";

import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Progress } from "../../components/ui/progress";
import { Separator } from "../../components/ui/separator";
import { Badge } from "../../components/ui/badge";

interface PersonalityAnalysisProps {
  astrolabe: any;
}

interface PersonalityTraitProps {
  title: string;
  content: string;
  className?: string;
}

interface StrengthWeaknessProps {
  title: string;
  items: string[];
  className?: string;
}

interface TraitScoreProps {
  trait: string;
  score: number;
  description: string;
}

const PersonalityTrait = ({ title, content, className }: PersonalityTraitProps) => (
  <div className={`mb-4 ${className}`}>
    <h4 className="text-base font-medium text-foreground mb-1">{title}</h4>
    <p className="text-sm text-muted-foreground">{content}</p>
  </div>
);

const StrengthWeakness = ({ title, items, className }: StrengthWeaknessProps) => (
  <div className={`mb-4 ${className}`}>
    <h4 className="text-base font-medium text-foreground mb-2">{title}</h4>
    <div className="flex flex-wrap gap-2">
      {items.map((item, index) => (
        <Badge key={index} variant="outline" className="px-3 py-1">
          {item}
        </Badge>
      ))}
    </div>
  </div>
);

const TraitScore = ({ trait, score, description }: TraitScoreProps) => (
  <div className="mb-4">
    <div className="flex justify-between items-center mb-1">
      <span className="text-sm font-medium">{trait}</span>
      <span className="text-sm text-muted-foreground">{score}/10</span>
    </div>
    <Progress value={score * 10} className="h-2 mb-1" />
    <p className="text-xs text-muted-foreground">{description}</p>
  </div>
);

export default function PersonalityAnalysis({ astrolabe }: PersonalityAnalysisProps) {
  if (!astrolabe) {
    return <div>无法分析，星盘数据不完整</div>;
  }

  // 获取命宫、身宫、福德宫和三方四正
  const palaces = Array.isArray(astrolabe.palaces) ? astrolabe.palaces : [];

  // 统一使用palace函数而不是palaces数组查找
  const destinyPalace = astrolabe.palace("命宮");
  const bodyPalace = astrolabe.palace("身宮");
  const fortunePalace = astrolabe.palace("福德宮");
  const careerPalace = astrolabe.palace("官祿宮");
  const wealthPalace = astrolabe.palace("財帛宮");
  const friendsPalace = astrolabe.palace("交友宮");

  // 移除JSON.stringify，直接打印对象
  console.log("命宫存在:", destinyPalace ? "是" : "否");
  if (destinyPalace) {
    console.log("命宫属性:", Object.keys(destinyPalace));
    // 查看stars属性，这是我们需要的
    console.log("命宫stars属性:", destinyPalace.stars);
    console.log("命宫starList属性:", destinyPalace.starList);
  }

  // 获取星曜信息 - 直接使用majorStars属性
  const destinyMajorStars = destinyPalace ? 
    (destinyPalace.majorStars || []).map((star: any) => star.name || star) : 
    [];
  
  // 获取身宫主星和辅星
  const bodyMajorStars = bodyPalace ? 
    (bodyPalace.majorStars || []).map((star: any) => star.name || star) : 
    [];

  // 获取福德宫主星和辅星
  const fortuneMajorStars = fortunePalace ? 
    (fortunePalace.majorStars || []).map((star: any) => star.name || star) : 
    [];

  // 辅星获取
  const destinyMinorStars = destinyPalace ? 
    (destinyPalace.minorStars || []).map((star: any) => star.name || star) : 
    [];

  // 添加调试输出
  console.log("星盘数据命宫主星:", destinyMajorStars);
  console.log("星盘数据身宫主星:", bodyMajorStars);
  console.log("星盘数据福德宫主星:", fortuneMajorStars);

  // 分析性格特质
  const analyzeMainPersonality = () => {
    let analysis = "";
    
    // 根据命宫主星分析主要性格
    if (destinyMajorStars.includes("紫微")) {
      analysis = "您具有天生的领导气质，沉稳大度，有责任感，做事有条理，善于统筹全局。正直诚信，具有高尚的品德和较强的权威感。在群体中通常能够脱颖而出，担任重要角色。";
    } else if (destinyMajorStars.includes("天机")) {
      analysis = "您聪明机智，思维敏捷，有很强的学习能力和创造力。喜欢思考分析，对新事物充满好奇心，有一定的预见性。性格活泼灵动，善于表达，但有时显得多变。";
    } else if (destinyMajorStars.includes("太阳")) {
      analysis = "您光明磊落，为人正直，具有阳光开朗的性格和积极向上的态度。有领导才能，处事公正，重视名誉，擅长与人相处。在事业上有冲劲，愿意展现自我。";
    } else if (destinyMajorStars.includes("武曲")) {
      analysis = "您勤劳务实，做事雷厉风行，有很强的执行力和自律性。精明能干，善于理财和管理，有经商头脑。性格刚毅坚定，做事认真负责，追求完美。";
    } else if (destinyMajorStars.includes("天同")) {
      analysis = "您性格温和善良，富有同情心和包容心，待人真诚热情。为人宽厚仁慈，愿意帮助他人，重视人际关系和谐。情感丰富，有一定的艺术鉴赏能力。";
    } else if (destinyMajorStars.includes("廉贞")) {
      analysis = "您性格刚直不阿，有很强的原则性和正义感，不轻易妥协。做事认真严谨，有独立思考能力，不盲从。内心坚强，意志力强，但有时显得固执。";
    } else if (destinyMajorStars.includes("天府")) {
      analysis = "您沉稳踏实，有很强的积累能力和耐心。处事圆融，做事有计划性，善于把握机会。待人和气，为人低调内敛，有涵养。具有较强的财富意识和管理能力。";
    } else if (destinyMajorStars.includes("太阴")) {
      analysis = "您性格敏感细腻，情感丰富，有很强的直觉和感受力。善解人意，富有同情心，重视内心感受。有艺术天赋，想象力丰富，但情绪波动较大。";
    } else if (destinyMajorStars.includes("贪狼")) {
      analysis = "您精力充沛，富有进取心和冒险精神。性格开朗活泼，社交能力强，善于争取机会。有较强的自我意识，追求个人成就和满足。情感丰富，对美好事物充满热情。";
    } else if (destinyMajorStars.includes("巨门")) {
      analysis = "您思维缜密，善于分析和判断，有很强的逻辑思维能力。性格内敛，不善于表达情感，做事谨慎小心。有批判精神，不轻信他人，对事物有自己独到的见解。";
    } else if (destinyMajorStars.includes("天相")) {
      analysis = "您性格温和，富有同情心和服务精神，乐于助人。为人正直诚实，重视道德伦理，受人尊敬。有一定的艺术鉴赏能力，追求精神生活的充实。";
    } else if (destinyMajorStars.includes("天梁")) {
      analysis = "您正直守信，公平正义，有很强的责任感和使命感。待人真诚，重视信誉，在处事上显得稳重大方。有领导能力，能够得到他人的信任和支持。";
    } else if (destinyMajorStars.includes("七杀")) {
      analysis = "您性格刚强，有决断力和行动力，不畏挑战和困难。有领导才能，果断坚决，在竞争中显示出强大的战斗力。直率坦诚，不善于掩饰情感，但有时显得急躁。";
    } else if (destinyMajorStars.includes("破军")) {
      analysis = "您性格独立，有开拓精神和冒险意识，不甘平凡。做事有魄力，敢于打破常规，有创新意识。行动力强，直接果断，但有时显得反叛和不稳定。";
    } else {
      analysis = "您的性格较为复杂多变，受多种星曜影响，展现出多元化的特质。适应能力强，能够根据环境灵活调整自己的行为方式。";
    }
    
    return analysis;
  };
  
  // 分析内在性格
  const analyzeInnerPersonality = () => {
    let analysis = "从身宫星曜组合来看，您的内在性格";
    
    if (bodyMajorStars.includes("紫微") || bodyMajorStars.includes("天府") || bodyMajorStars.includes("武曲")) {
      analysis += "沉稳内敛，自律性强，有主见，内心渴望获得认可和尊重。";
    } else if (bodyMajorStars.includes("太阳") || bodyMajorStars.includes("天相") || bodyMajorStars.includes("天梁")) {
      analysis += "正直善良，内心光明，有助人之心，追求公平正义，希望得到他人的肯定。";
    } else if (bodyMajorStars.includes("天同") || bodyMajorStars.includes("太阴")) {
      analysis += "情感丰富，感性多于理性，内心柔软，容易共情，重视情感连接和内心和谐。";
    } else if (bodyMajorStars.includes("贪狼") || bodyMajorStars.includes("破军")) {
      analysis += "充满活力，内心渴望自由和刺激，有冒险精神，不喜欢被约束，追求自我实现。";
    } else if (bodyMajorStars.includes("天机") || bodyMajorStars.includes("巨门")) {
      analysis += "思维活跃，内心充满好奇，喜欢思考和分析，追求知识和智慧，有自己的想法和判断。";
    } else if (bodyMajorStars.includes("廉贞") || bodyMajorStars.includes("七杀")) {
      analysis += "意志坚定，内心强大，有原则和底线，不轻易妥协，在面对困难时表现出坚韧不拔的精神。";
    } else {
      analysis += "多元复杂，呈现出不同场合的不同面貌，内外性格可能存在一定差异。";
    }
    
    // 加入辅星分析
    if (destinyMinorStars.includes("文昌") || destinyMinorStars.includes("文曲")) {
      analysis += " 您内心重视文化修养和知识积累，有求知欲望，喜欢学习和思考。";
    }
    if (destinyMinorStars.includes("禄存")) {
      analysis += " 内心渴望物质安全感，追求稳定和富足的生活。";
    }
    
    return analysis;
  };
  
  // 分析精神世界和内在追求
  const analyzeSpiritualPursuit = () => {
    let analysis = "";
    
    if (fortuneMajorStars.includes("紫微") || fortuneMajorStars.includes("天府")) {
      analysis = "您精神层面追求内在平静和稳定，喜欢思考人生哲理，重视个人修养和内在成长。内心渴望获得尊重和肯定，有一定的精神追求。";
    } else if (fortuneMajorStars.includes("天机") || fortuneMajorStars.includes("巨门")) {
      analysis = "您精神世界丰富，喜欢探索未知和解决问题，对知识和智慧有强烈追求。内心渴望理解世界的运行规律，享受思考和分析的过程。";
    } else if (fortuneMajorStars.includes("太阳") || fortuneMajorStars.includes("天相")) {
      analysis = "您精神层面追求光明和正义，重视道德伦理，内心向往美好和谐的世界。有助人之心，在精神上得到满足和成长。";
    } else if (fortuneMajorStars.includes("武曲") || fortuneMajorStars.includes("七杀")) {
      analysis = "您在精神层面追求成就和突破，内心渴望克服挑战和困难，通过实现目标获得满足感。意志力强，有克服困难的决心。";
    } else if (fortuneMajorStars.includes("天同") || fortuneMajorStars.includes("太阴")) {
      analysis = "您精神世界偏向感性，追求情感上的满足和艺术美感，内心渴望和谐的人际关系和美好的生活体验。喜欢艺术和文化活动。";
    } else if (fortuneMajorStars.includes("贪狼") || fortuneMajorStars.includes("破军")) {
      analysis = "您精神层面追求自由和刺激，内心渴望探索和冒险，不愿被常规所束缚。追求个性化的生活方式和独特的人生体验。";
    } else {
      analysis = "您的精神追求多元而丰富，能够从不同领域获得满足和成长，内心世界复杂而有深度。";
    }
    
    return analysis;
  };
  
  // 分析性格优势
  const analyzeStrengths = () => {
    const strengths = [];
    
    // 根据命宫和身宫主星分析优势
    const allMajorStars = [...destinyMajorStars, ...bodyMajorStars];
    
    if (allMajorStars.includes("紫微")) strengths.push("领导能力", "统筹全局");
    if (allMajorStars.includes("天机")) strengths.push("思维敏捷", "创造力");
    if (allMajorStars.includes("太阳")) strengths.push("正直坦诚", "积极乐观");
    if (allMajorStars.includes("武曲")) strengths.push("执行力强", "自律性高");
    if (allMajorStars.includes("天同")) strengths.push("善解人意", "包容心强");
    if (allMajorStars.includes("廉贞")) strengths.push("原则性强", "独立思考");
    if (allMajorStars.includes("天府")) strengths.push("沉稳踏实", "规划能力");
    if (allMajorStars.includes("太阴")) strengths.push("细腻敏感", "直觉力强");
    if (allMajorStars.includes("贪狼")) strengths.push("活力充沛", "社交能力");
    if (allMajorStars.includes("巨门")) strengths.push("分析能力", "逻辑思维");
    if (allMajorStars.includes("天相")) strengths.push("助人为乐", "受人尊重");
    if (allMajorStars.includes("天梁")) strengths.push("责任感强", "公平正义");
    if (allMajorStars.includes("七杀")) strengths.push("果断决策", "意志坚定");
    if (allMajorStars.includes("破军")) strengths.push("开拓创新", "独立自主");
    
    // 根据辅星添加优势
    const allMinorStars = [...destinyMinorStars];
    
    if (allMinorStars.includes("文昌") || allMinorStars.includes("文曲")) 
      strengths.push("学习能力", "表达能力");
    if (allMinorStars.includes("左辅") || allMinorStars.includes("右弼")) 
      strengths.push("人际关系", "获得支持");
    if (allMinorStars.includes("天魁") || allMinorStars.includes("天钺")) 
      strengths.push("贵人运", "领导才能");
    if (allMinorStars.includes("禄存")) 
      strengths.push("财富意识", "资源整合");
    
    // 去重并限制数量
    const uniqueStrengths = Array.from(new Set(strengths));
    return uniqueStrengths.slice(0, 8);
  };
  
  // 分析性格挑战
  const analyzeChallenges = () => {
    const challenges = [];
    
    // 根据命宫和身宫主星分析挑战
    const allMajorStars = [...destinyMajorStars, ...bodyMajorStars];
    
    if (allMajorStars.includes("紫微")) challenges.push("过于自我", "要求过高");
    if (allMajorStars.includes("天机")) challenges.push("优柔寡断", "多变不定");
    if (allMajorStars.includes("太阳")) challenges.push("自我展现", "过于理想");
    if (allMajorStars.includes("武曲")) challenges.push("过于严苛", "工作过度");
    if (allMajorStars.includes("天同")) challenges.push("过于感性", "界限模糊");
    if (allMajorStars.includes("廉贞")) challenges.push("固执己见", "情绪波动");
    if (allMajorStars.includes("天府")) challenges.push("过于保守", "缺乏冒险");
    if (allMajorStars.includes("太阴")) challenges.push("情绪化", "过度敏感");
    if (allMajorStars.includes("贪狼")) challenges.push("冲动行事", "注意力分散");
    if (allMajorStars.includes("巨门")) challenges.push("过度思考", "消极思维");
    if (allMajorStars.includes("天相")) challenges.push("过于理想", "难以拒绝");
    if (allMajorStars.includes("天梁")) challenges.push("过于固执", "不够灵活");
    if (allMajorStars.includes("七杀")) challenges.push("脾气急躁", "易冲突");
    if (allMajorStars.includes("破军")) challenges.push("缺乏稳定", "叛逆倾向");
    
    // 根据特定组合添加挑战
    if (allMajorStars.includes("廉贞") && allMajorStars.includes("巨门")) 
      challenges.push("过度忧虑", "自我怀疑");
    if (allMajorStars.includes("贪狼") && allMajorStars.includes("七杀")) 
      challenges.push("冲动冒险", "人际冲突");
    
    // 去重并限制数量
    const uniqueChallenges = Array.from(new Set(challenges));
    return uniqueChallenges.slice(0, 6);
  };
  
  // 生成针对性建议
  const generateAdvice = () => {
    const challenges = analyzeChallenges();
    const advice = [];
    
    if (challenges.includes("过于自我") || challenges.includes("要求过高")) {
      advice.push("学会适当放低标准，接受不完美，倾听他人意见可以让您的决策更全面。");
    }
    
    if (challenges.includes("优柔寡断") || challenges.includes("多变不定")) {
      advice.push("培养做决定的能力，设定明确的标准和期限，减少选择的范围可以帮助您更果断。");
    }
    
    if (challenges.includes("过于感性") || challenges.includes("情绪化") || challenges.includes("过度敏感")) {
      advice.push("学习情绪管理技巧，如正念冥想、深呼吸等，保持一定的理性思考可以帮助您更好地控制情绪波动。");
    }
    
    if (challenges.includes("过于严苛") || challenges.includes("工作过度")) {
      advice.push("合理安排工作与休息，学会委派任务，设定健康的界限，防止过度劳累和精力透支。");
    }
    
    if (challenges.includes("固执己见") || challenges.includes("过于固执")) {
      advice.push("培养开放的心态，尝试从不同角度看问题，接受新观点和变化可以拓宽您的视野。");
    }
    
    if (challenges.includes("过于保守") || challenges.includes("缺乏冒险")) {
      advice.push("适当走出舒适区，尝试新事物和挑战，从小处开始培养冒险精神，扩大您的可能性。");
    }
    
    if (challenges.includes("冲动行事") || challenges.includes("脾气急躁") || challenges.includes("易冲突")) {
      advice.push("培养耐心和自制力，决策前先暂停思考，练习深呼吸或数到10，避免在情绪激动时做决定。");
    }
    
    if (challenges.includes("过度思考") || challenges.includes("消极思维") || challenges.includes("自我怀疑")) {
      advice.push("学习认知重构技巧，挑战负面思维模式，培养积极心态，关注当下而非过度担忧未来。");
    }
    
    // 加入通用建议
    advice.push("充分发挥您的优势特质，在保持真实自我的同时，有意识地改善潜在的挑战领域。");
    advice.push("寻找能够理解和欣赏您独特性格的环境和人际关系，这将有助于您的个人成长和幸福感。");
    
    return advice;
  };
  
  // 生成个性维度评分
  const generateTraitScores = () => {
    const allMajorStars = [...destinyMajorStars, ...bodyMajorStars, ...fortuneMajorStars];
    const allMinorStars = [...destinyMinorStars];
    
    // 初始化各维度评分
    let extraversion = 5; // 外向性
    let agreeableness = 5; // 宜人性
    let conscientiousness = 5; // 尽责性
    let neuroticism = 5; // 神经质
    let openness = 5; // 开放性
    let ambition = 5; // 进取心
    
    // 根据主星调整评分
    if (allMajorStars.includes("紫微")) {
      extraversion += 1;
      conscientiousness += 2;
      ambition += 2;
    }
    
    if (allMajorStars.includes("天机")) {
      openness += 2;
      neuroticism += 1;
      extraversion += 1;
    }
    
    if (allMajorStars.includes("太阳")) {
      extraversion += 2;
      agreeableness += 1;
      ambition += 1;
    }
    
    if (allMajorStars.includes("武曲")) {
      conscientiousness += 2;
      ambition += 2;
      extraversion -= 1;
    }
    
    if (allMajorStars.includes("天同")) {
      agreeableness += 2;
      neuroticism -= 1;
      conscientiousness -= 1;
    }
    
    if (allMajorStars.includes("廉贞")) {
      neuroticism += 1;
      openness += 1;
      agreeableness -= 1;
    }
    
    if (allMajorStars.includes("天府")) {
      conscientiousness += 1;
      extraversion -= 1;
      neuroticism -= 1;
    }
    
    if (allMajorStars.includes("太阴")) {
      neuroticism += 2;
      agreeableness += 1;
      openness += 1;
    }
    
    if (allMajorStars.includes("贪狼")) {
      extraversion += 2;
      ambition += 2;
      conscientiousness -= 1;
    }
    
    if (allMajorStars.includes("巨门")) {
      openness += 1;
      extraversion -= 1;
      neuroticism += 1;
    }
    
    if (allMajorStars.includes("天相")) {
      agreeableness += 2;
      conscientiousness += 1;
      ambition -= 1;
    }
    
    if (allMajorStars.includes("天梁")) {
      conscientiousness += 2;
      agreeableness += 1;
      openness -= 1;
    }
    
    if (allMajorStars.includes("七杀")) {
      ambition += 2;
      extraversion += 1;
      agreeableness -= 1;
    }
    
    if (allMajorStars.includes("破军")) {
      openness += 2;
      ambition += 2;
      agreeableness -= 1;
    }
    
    // 根据辅星调整评分
    if (allMinorStars.includes("文昌") || allMinorStars.includes("文曲")) {
      openness += 1;
      conscientiousness += 1;
    }
    
    if (allMinorStars.includes("左辅") || allMinorStars.includes("右弼")) {
      agreeableness += 1;
      extraversion += 1;
    }
    
    if (allMinorStars.includes("禄存")) {
      conscientiousness += 1;
      ambition += 1;
    }
    
    // 确保评分在1-10之间
    const clamp = (num: number) => Math.max(1, Math.min(10, Math.round(num)));
    
    return [
      {
        trait: "外向性",
        score: clamp(extraversion),
        description: "社交、活力和积极情绪的倾向"
      },
      {
        trait: "宜人性",
        score: clamp(agreeableness),
        description: "关心他人、同情心和助人的倾向"
      },
      {
        trait: "尽责性",
        score: clamp(conscientiousness),
        description: "自律、责任感和组织能力的倾向"
      },
      {
        trait: "情绪稳定性",
        score: clamp(10 - neuroticism),
        description: "保持情绪平衡和应对压力的能力"
      },
      {
        trait: "开放性",
        score: clamp(openness),
        description: "好奇心、创造力和接受新体验的倾向"
      },
      {
        trait: "进取心",
        score: clamp(ambition),
        description: "追求目标、克服挑战和寻求成功的动力"
      }
    ];
  };
  
  // 生成报告内容
  const mainPersonality = analyzeMainPersonality();
  const innerPersonality = analyzeInnerPersonality();
  const spiritualPursuit = analyzeSpiritualPursuit();
  const strengths = analyzeStrengths();
  const challenges = analyzeChallenges();
  const advice = generateAdvice();
  const traitScores = generateTraitScores();
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>个性化性格分析报告</CardTitle>
          <CardDescription>基于紫微斗数星盘的多维度性格特质解读</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <PersonalityTrait 
            title="整体性格概述" 
            content={mainPersonality}
            className="pb-4 border-b"
          />
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <PersonalityTrait 
              title="内在性格" 
              content={innerPersonality}
            />
            <PersonalityTrait 
              title="精神追求" 
              content={spiritualPursuit}
            />
          </div>
          
          <Separator />
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <StrengthWeakness 
              title="性格优势" 
              items={strengths} 
            />
            <StrengthWeakness 
              title="性格挑战" 
              items={challenges} 
            />
          </div>
          
          <Separator />
          
          <div>
            <h4 className="text-base font-medium text-foreground mb-2">个性维度评分</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {traitScores.map((trait, index) => (
                <TraitScore 
                  key={index} 
                  trait={trait.trait} 
                  score={trait.score} 
                  description={trait.description} 
                />
              ))}
            </div>
          </div>
          
          <Separator />
          
          <div>
            <h4 className="text-base font-medium text-foreground mb-2">个性化建议</h4>
            <ul className="space-y-2">
              {advice.map((item, index) => (
                <li key={index} className="text-sm">
                  {item}
                </li>
              ))}
            </ul>
          </div>
          
          <div className="mt-6 p-4 bg-muted rounded-md">
            <p className="text-sm text-muted-foreground">
              注：此分析基于紫微斗数星盘的主星和辅星组合，结合命宫、身宫和福德宫等多个宫位信息综合分析而成。星盘只是一种参考工具，最终的人格发展取决于个人的选择和努力。
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 