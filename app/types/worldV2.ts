/*
 * @LastEditors: biz
 */
/**
 * 世界管理器V2版本类型定义
 */

export interface WorldTypeOption {
  id: string;
  name: string;
  description: string;
}

export type WorldOptionRefinementLevel = 'basic' | 'standard' | 'detailed';

// 世界选项生成参数
export interface WorldOptionsGenerationParams {
  worldType: string;
  prompt: string;
  refinementLevel: WorldOptionRefinementLevel;
  optionsCount?: number;
  provider: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

// 世界生成选项响应
export interface WorldOptionsResponse {
  success: boolean;
  data?: WorldPropertyOption[];
  error?: string;
}

// 世界属性选项
export interface WorldPropertyOption {
  id: string;
  name: string;
  description: string;
  category: string;
  subcategories?: WorldPropertyOption[];
}

// 世界生成参数
export interface WorldGenerationParamsV2 {
  selectedProperties: string[];
  propertyDetails: Record<string, string>;
  prompt: string;
  provider: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

// 世界生成响应
export interface WorldGenerationResponseV2 {
  success: boolean;
  data?: {
    content: string;
  };
  error?: string;
}

// 世界数据
export interface WorldDataV2 {
  id?: string;
  name: string;
  description: string;
  content: string;
  worldType: string;
  createdAt?: string;
  updatedAt?: string;
}

// 数据库中存储的世界属性条目
export interface WorldPropertyLibraryItem {
  id: string;
  name: string;
  description: string;
  category: string;
  worldType: string; // 属性来源的世界类型
  usageCount: number; // 使用次数
  createdAt: string;
  updatedAt: string;
}

// 保存世界属性到库的请求
export interface SavePropertyToLibraryRequest {
  property: WorldPropertyOption;
  worldType: string;
}

// 从属性库中检索属性的响应
export interface PropertyLibraryResponse {
  success: boolean;
  data?: WorldPropertyLibraryItem[];
  error?: string;
} 