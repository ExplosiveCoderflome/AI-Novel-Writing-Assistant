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