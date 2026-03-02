/*
 * @LastEditors: biz
 */
import { useState, useEffect } from "react";
import { useIztro } from "iztro-hook";

type ZiWeiDataInput = {
  birthday: string;
  birthTime: number;
  gender: "male" | "female";
  birthdayType: "solar" | "lunar";
  isLeapMonth?: boolean;
  fixLeap?: boolean;
};

// 定义星曜类型
interface Star {
  name: string;
  type: string;
  scope?: string;
  [key: string]: any;
}

export const useZiWeiData = ({
  birthday,
  birthTime,
  gender,
  birthdayType,
  isLeapMonth = false,
  fixLeap = true
}: ZiWeiDataInput) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // 转换性别格式以适应iztro-hook
  const genderValue: "男" | "女" = gender === "male" ? "男" : "女";
  
  // 确保birthTime在有效范围内（0-11）
  const validBirthTime = birthTime >= 0 && birthTime <= 11 ? birthTime : 0;
  
  // 添加详细调试输出
  console.log("正在生成星盘，原始输入参数:", { 
    birthday, 
    birthTime, 
    gender,
    birthdayType,
    isLeapMonth
  });
  
  console.log("处理后的参数:", {
    birthday, 
    birthTime: validBirthTime, 
    gender: genderValue, 
    birthdayType,
    isLeapMonth
  });
  
  const { astrolabe, horoscope, setHoroscope } = useIztro({
    birthday,
    birthTime: validBirthTime,
    gender: genderValue,
    birthdayType,
    isLeapMonth,
    fixLeap
  });
  
  useEffect(() => {
    if (astrolabe) {
      setLoading(false);
      setError(null);
      console.log("星盘生成成功:", astrolabe);
      
      // 输出宫位数组信息
      const palaces = Array.isArray(astrolabe.palaces) ? astrolabe.palaces : [];
      console.log(`宫位数组长度: ${palaces.length}`,palaces);
      
      // 输出命宫、身宫、福德宫信息
      const destinyPalace = palaces.find(p => p.type === "命宮");
      const bodyPalace = palaces.find(p => p.type === "身宮");
      const fortunePalace = palaces.find(p => p.type === "福德宮");
      
      console.log("命宫信息:", destinyPalace);
      console.log("身宫信息:", bodyPalace);
      console.log("福德宫信息:", fortunePalace);
      
      if (destinyPalace) {
        console.log("命宫主星:", destinyPalace.majorStars?.map((s: Star) => s.name));
        console.log("命宫辅星:", destinyPalace.minorStars?.map((s: Star) => s.name));
      }
    } else {
      setLoading(true);
      console.log("星盘生成中或生成失败");
    }
  }, [astrolabe]);
  
  // 设置当前的运限日期
  const setHoroscopeDate = (date: Date | string, hour?: number) => {
    try {
      console.log("设置运限日期:", date, "时辰:", hour);
      setHoroscope(date, hour);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "设置运限日期时出错";
      console.error("设置运限日期出错:", errorMessage);
      setError(errorMessage);
    }
  };
  
  return {
    astrolabe,
    horoscope,
    setHoroscopeDate,
    loading,
    error
  };
}; 