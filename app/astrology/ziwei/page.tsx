"use client";

import React, { useState } from "react";
import { Iztrolabe } from "react-iztro";
import { useRouter } from "next/navigation";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { RadioGroup, RadioGroupItem } from "../../components/ui/radio-group";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { cn } from "../../lib/utils";
import ZiWeiAnalysis from "./ZiWeiAnalysis";
import { BetterDatePicker } from "../../components/ui/better-date-picker";

const timeOptions = [
  { value: 0, label: "子时 (23:00-01:00)" },
  { value: 1, label: "丑时 (01:00-03:00)" },
  { value: 2, label: "寅时 (03:00-05:00)" },
  { value: 3, label: "卯时 (05:00-07:00)" },
  { value: 4, label: "辰时 (07:00-09:00)" },
  { value: 5, label: "巳时 (09:00-11:00)" },
  { value: 6, label: "午时 (11:00-13:00)" },
  { value: 7, label: "未时 (13:00-15:00)" },
  { value: 8, label: "申时 (15:00-17:00)" },
  { value: 9, label: "酉时 (17:00-19:00)" },
  { value: 10, label: "戌时 (19:00-21:00)" },
  { value: 11, label: "亥时 (21:00-23:00)" }
];

export default function ZiWeiPage() {
  const router = useRouter();
  const [birthDate, setBirthDate] = useState<Date | undefined>(new Date());
  const [birthTime, setBirthTime] = useState<number>(0);
  const [gender, setGender] = useState<"male" | "female">("male");
  const [birthdayType, setBirthdayType] = useState<"solar" | "lunar">("solar");
  const [isLeapMonth, setIsLeapMonth] = useState<boolean>(false);
  const [formSubmitted, setFormSubmitted] = useState<boolean>(false);
  const [showAnalysis, setShowAnalysis] = useState<boolean>(false);
  
  // 添加状态来保存表单提交时的信息
  const [submittedData, setSubmittedData] = useState({
    birthday: "",
    birthTime: 0,
    gender: "male" as "male" | "female",
    birthdayType: "solar" as "solar" | "lunar",
    isLeapMonth: false
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // 保存当前表单数据
    if (birthDate) {
      setSubmittedData({
        birthday: format(birthDate, "yyyy-MM-dd"),
        birthTime,
        gender,
        birthdayType,
        isLeapMonth
      });
      
      console.log("提交表单数据:", {
        birthday: format(birthDate, "yyyy-MM-dd"),
        birthTime,
        gender,
        birthdayType,
        isLeapMonth
      });
      
      setFormSubmitted(true);
      // 默认显示分析
      setShowAnalysis(true);
    }
  };

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8 text-center">紫微斗数排盘</h1>
      
      {!formSubmitted ? (
        <div className="max-w-md mx-auto bg-card rounded-lg shadow-md p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="birthDate">出生日期</Label>
              <BetterDatePicker
                date={birthDate} 
                setDate={setBirthDate}
                placeholder="选择出生日期"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="birthTime">出生时辰</Label>
              <Select
                value={birthTime.toString()}
                onValueChange={(value) => setBirthTime(parseInt(value))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择时辰" />
                </SelectTrigger>
                <SelectContent>
                  {timeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value.toString()}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>性别</Label>
              <RadioGroup
                defaultValue={gender}
                onValueChange={(value) => setGender(value as "male" | "female")}
                className="flex space-x-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="male" id="male" />
                  <Label htmlFor="male">男</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="female" id="female" />
                  <Label htmlFor="female">女</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label>历法</Label>
              <RadioGroup
                defaultValue={birthdayType}
                onValueChange={(value) => setBirthdayType(value as "solar" | "lunar")}
                className="flex space-x-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="solar" id="solar" />
                  <Label htmlFor="solar">阳历</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="lunar" id="lunar" />
                  <Label htmlFor="lunar">阴历</Label>
                </div>
              </RadioGroup>
            </div>

            {birthdayType === "lunar" && (
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isLeapMonth"
                  checked={isLeapMonth}
                  onChange={(e) => setIsLeapMonth(e.target.checked)}
                  className="rounded border-gray-300 text-primary focus:ring-primary"
                />
                <Label htmlFor="isLeapMonth">闰月</Label>
              </div>
            )}

            <Button type="submit" className="w-full">生成星盘</Button>
          </form>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-card rounded-lg shadow-md p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">命盘信息</h2>
              <Button 
                variant="outline" 
                onClick={() => setFormSubmitted(false)}
                tabIndex={0}
                aria-label="返回修改信息"
                onKeyDown={(e) => e.key === "Enter" && setFormSubmitted(false)}
              >
                修改信息
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>出生日期: {birthDate && format(birthDate, "yyyy年MM月dd日", { locale: zhCN })} ({birthdayType === "solar" ? "阳历" : "阴历"})</div>
              <div>出生时辰: {timeOptions.find(t => t.value === birthTime)?.label}</div>
              <div>性别: {gender === "male" ? "男" : "女"}</div>
              {birthdayType === "lunar" && isLeapMonth && <div>闰月: 是</div>}
            </div>
          </div>

          <div className="astrolabe-container overflow-x-auto">
            <div style={{ width: "100%", minWidth: "800px", margin: "0 auto" }}>
              <Iztrolabe 
                birthday={submittedData.birthday}
                birthTime={submittedData.birthTime} 
                birthdayType={submittedData.birthdayType} 
                gender={submittedData.gender === "male" ? "男" : "女"} 
                horoscopeDate={new Date()}
                isLeapMonth={submittedData.isLeapMonth}
                fixLeap={true}
              />
            </div>
          </div>
          
          <div className="flex justify-center">
            <Button 
              onClick={() => setShowAnalysis(!showAnalysis)}
              variant="outline"
              className="mb-4"
              tabIndex={0}
              aria-label={showAnalysis ? "隐藏详细分析" : "查看详细分析"}
              onKeyDown={(e) => e.key === "Enter" && setShowAnalysis(!showAnalysis)}
            >
              {showAnalysis ? "隐藏详细分析" : "查看详细分析"}
            </Button>
          </div>
          
          {showAnalysis && birthDate && (
            <ZiWeiAnalysis
              birthday={submittedData.birthday} 
              birthTime={submittedData.birthTime}
              gender={submittedData.gender}
              birthdayType={submittedData.birthdayType}
              isLeapMonth={submittedData.isLeapMonth}
            />
          )}
          
          <div className="bg-card rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">关于紫微斗数</h2>
            <p className="mb-4">紫微斗数是中国传统命理学的一种，它通过出生时间计算星盘，分析一个人的性格、潜能、运势等。</p>
            <p className="mb-4">紫微斗数能做什么：</p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>性格推演 - 通过十二宫位对一个人的个性进行全方位分析</li>
              <li>子女教育 - 帮助家长了解子女不同场合的性格特点，做到因材施教</li>
              <li>职业规划 - 对于不确定自己职业方向的人，提供参考和指导</li>
              <li>社交谈资 - 像星座和MBTI一样，紫微斗数也可以作为社交话题</li>
            </ul>
            <p>更多紫微斗数知识，可以访问 <a href="https://docs.iztro.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">紫微斗数文档</a>。</p>
          </div>
        </div>
      )}
    </div>
  );
} 