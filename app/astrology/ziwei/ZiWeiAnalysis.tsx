"use client";

import React from "react";
import { useZiWeiData } from "./useZiWeiData";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Skeleton } from "../../components/ui/skeleton";
import PersonalityAnalysis from "./PersonalityAnalysis";

interface ZiWeiAnalysisProps {
  birthday: string;
  birthTime: number;
  gender: "male" | "female";
  birthdayType: "solar" | "lunar";
  isLeapMonth?: boolean;
}

const PersonalityTrait = ({ title, content }: { title: string; content: string }) => (
  <div className="mb-3">
    <h4 className="text-sm font-medium text-muted-foreground">{title}</h4>
    <p className="mt-1">{content}</p>
  </div>
);

export default function ZiWeiAnalysis({
  birthday,
  birthTime,
  gender,
  birthdayType,
  isLeapMonth = false,
}: ZiWeiAnalysisProps) {
  const { astrolabe, loading, error } = useZiWeiData({
    birthday,
    birthTime,
    gender,
    birthdayType,
    isLeapMonth,
  });

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !astrolabe) {
    return (
      <div className="p-4 bg-destructive/10 border border-destructive rounded-md">
        <p className="text-destructive">
          {error || "无法生成分析结果，请检查您的出生信息是否正确。"}
        </p>
      </div>
    );
  }

  // 获取命宫和身宫
  // 注意：我们使用类型断言来解决类型错误，因为iztro类型定义可能与我们期望的不同
  const palaces = Array.isArray(astrolabe.palace) ? astrolabe.palace : [];
  const destinyPalace = palaces.find((p: any) => p.type === "命宮");
  const bodyPalace = palaces.find((p: any) => p.type === "身宮");

  // 性格分析函数
  const getPersonalityAnalysis = (palace: any) => {
    if (!palace) return "无法分析";
    
    // 根据宫位和星耀分析性格
    const stars = palace.majorStars?.map((s: any) => s.name) || [];
    const assistStars = palace.minorStars?.map((s: any) => s.name) || [];
    
    let analysis = "";
    
    // 简单的规则示例 - 在实际应用中，这里应该有更复杂的分析逻辑
    if (stars.includes("紫微")) {
      analysis += "性格稳重，有领导才能，具备统筹全局的能力。";
    } else if (stars.includes("天机")) {
      analysis += "聪明机智，思维灵活，有创新精神。";
    } else if (stars.includes("太阳")) {
      analysis += "光明磊落，正直坦诚，有一定的权威性。";
    } else if (stars.includes("武曲")) {
      analysis += "勤奋务实，精明能干，有执行力。";
    } else if (stars.includes("天同")) {
      analysis += "性格温和，善解人意，重情重义。";
    } else if (stars.includes("廉贞")) {
      analysis += "性格刚正，有原则，不易妥协。";
    } else if (stars.includes("天府")) {
      analysis += "沉稳内敛，有涵养，善于积累。";
    } else if (stars.includes("太阴")) {
      analysis += "情感丰富，细腻敏感，有艺术天赋。";
    } else if (stars.includes("贪狼")) {
      analysis += "进取心强，活力充沛，勇于追求。";
    } else if (stars.includes("巨门")) {
      analysis += "思维缜密，善于分析，有批判精神。";
    } else if (stars.includes("天相")) {
      analysis += "慈悲心强，乐于助人，受人尊敬。";
    } else if (stars.includes("天梁")) {
      analysis += "正直守信，责任感强，处事公正。";
    } else if (stars.includes("七杀")) {
      analysis += "刚强果断，有决断力，不畏挑战。";
    } else if (stars.includes("破军")) {
      analysis += "开拓进取，勇于创新，有冒险精神。";
    } else {
      analysis += "性格多元，随环境变化而灵活应对。";
    }
    
    // 加入辅星分析
    if (assistStars.includes("文昌") || assistStars.includes("文曲")) {
      analysis += " 聪明好学，有文化修养，善于表达。";
    }
    if (assistStars.includes("左辅") || assistStars.includes("右弼")) {
      analysis += " 得人辅佐，人际关系良好。";
    }
    
    return analysis;
  };

  return (
    <div className="mt-8 bg-card rounded-lg shadow-md p-6">
      <Tabs defaultValue="personality">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
          <TabsTrigger value="personality">性格分析</TabsTrigger>
          <TabsTrigger value="career">事业财富</TabsTrigger>
          <TabsTrigger value="relationships">人际关系</TabsTrigger>
          <TabsTrigger value="health">健康运势</TabsTrigger>
        </TabsList>
        
        <TabsContent value="personality" className="mt-4">
          <PersonalityAnalysis astrolabe={astrolabe} />
        </TabsContent>
        
        <TabsContent value="career" className="mt-4">
          <h3 className="text-xl font-semibold mb-4">事业与财富</h3>
          <p className="text-muted-foreground italic">
            完整分析需要结合命宫、财帛宫、官禄宫、迁移宫等多个宫位信息。
          </p>
          <div className="p-8 flex items-center justify-center">
            <p>此功能正在开发中，敬请期待...</p>
          </div>
        </TabsContent>
        
        <TabsContent value="relationships" className="mt-4">
          <h3 className="text-xl font-semibold mb-4">人际关系</h3>
          <p className="text-muted-foreground italic">
            完整分析需要结合命宫、兄弟宫、夫妻宫、子女宫、父母宫等多个宫位信息。
          </p>
          <div className="p-8 flex items-center justify-center">
            <p>此功能正在开发中，敬请期待...</p>
          </div>
        </TabsContent>
        
        <TabsContent value="health" className="mt-4">
          <h3 className="text-xl font-semibold mb-4">健康状况</h3>
          <p className="text-muted-foreground italic">
            完整分析需要结合命宫、疾厄宫、福德宫等多个宫位信息。
          </p>
          <div className="p-8 flex items-center justify-center">
            <p>此功能正在开发中，敬请期待...</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
} 