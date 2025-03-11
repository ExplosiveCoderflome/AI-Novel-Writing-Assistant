/*
 * @LastEditors: biz
 */
// 写作公式类型
export interface WritingFormula {
  id: string;
  name: string;
  sourceText: string;
  analysis: WritingAnalysis;
  createdAt: Date;
  updatedAt: Date;
}

// 写作分析结构
export interface WritingAnalysis {
  // 基本信息
  genre: string;           // 体裁/类型
  style: string;           // 整体风格
  toneVoice: string;       // 语气/语调
  
  // 结构分析
  structure: string;       // 整体结构
  pacing: string;          // 节奏控制
  paragraphPattern: string; // 段落模式
  
  // 语言分析
  sentenceStructure: string; // 句式结构
  vocabularyLevel: string;   // 词汇水平
  rhetoricalDevices: string[]; // 修辞手法
  
  // 叙事分析
  narrativeMode: string;    // 叙事模式
  perspectivePoint: string; // 视角/人称
  characterVoice: string;   // 角色声音
  
  // 主题与内容
  themes: string[];        // 主题元素
  motifs: string[];        // 意象/符号
  emotionalTone: string;   // 情感基调
  
  // 特殊元素
  uniqueFeatures: string[]; // 独特特征
  
  // 公式提取
  formulaDescription: string; // 公式描述
  formulaSteps: string[];     // 公式步骤
  
  // 应用建议
  applicationTips: string[];  // 应用技巧
}

// 写作公式提取请求参数
export interface FormulaExtractionParams {
  sourceText: string;
  name?: string;
  extractionLevel?: 'basic' | 'detailed' | 'comprehensive';
  focusAreas?: string[];
}

// 写作公式应用请求参数
export interface FormulaApplicationParams {
  formulaId: string;
  prompt: string;
  targetLength?: number;
  preserveContent?: boolean;
  additionalInstructions?: string;
} 