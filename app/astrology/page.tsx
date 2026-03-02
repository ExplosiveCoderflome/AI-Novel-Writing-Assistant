"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Button } from "../components/ui/button";

export default function AstrologyPage() {
  const router = useRouter();

  return (
    <div className="container mx-auto py-12">
      <div className="max-w-3xl mx-auto text-center">
        <h1 className="text-4xl font-bold mb-6">命理工具</h1>
        <p className="text-lg mb-8">
          探索古老智慧与现代科技的结合。我们提供多种命理工具，帮助您更好地了解自己和世界。
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          <div className="bg-card rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-bold mb-4">紫微斗数</h2>
            <p className="mb-6">
              紫微斗数是中国传统命理学的一种，通过出生时间计算星盘，分析个人性格、潜能和运势。
            </p>
            <Button 
              onClick={() => router.push("/astrology/ziwei")}
              className="w-full"
              tabIndex={0}
              aria-label="进入紫微斗数工具"
              onKeyDown={(e) => e.key === "Enter" && router.push("/astrology/ziwei")}
            >
              开始排盘
            </Button>
          </div>
          
          <div className="bg-card rounded-lg shadow-md p-6 opacity-50">
            <h2 className="text-2xl font-bold mb-4">更多工具</h2>
            <p className="mb-6">
              我们正在开发更多命理工具，敬请期待！
            </p>
            <Button 
              disabled
              className="w-full"
            >
              即将推出
            </Button>
          </div>
        </div>
        
        <div className="bg-muted p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">免责声明</h2>
          <p className="text-sm">
            本站提供的命理工具仅供娱乐和参考。我们不保证分析结果的准确性，也不对用户基于这些结果所做的决定负责。请用户理性看待命理分析，不要将其作为人生重大决策的唯一依据。
          </p>
        </div>
      </div>
    </div>
  );
} 