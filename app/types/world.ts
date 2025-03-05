/*
 * @LastEditors: biz
 */
import { NovelGenre } from './novel';

export interface WorldElement {
  name: string;
  description: string;
  significance: string;
  attributes: Record<string, string>;
}

export interface WorldGeography {
  terrain: WorldElement[];
  climate: WorldElement[];
  locations: WorldElement[];
  spatialStructure?: {
    type: 'continuous' | 'heterogeneous_connected' | 'heterogeneous_isolated';
    description: string;
    connections: {
      from: string;
      to: string;
      type: string;
      conditions?: string;
    }[];
    boundaries: {
      location: string;
      type: string;
      permeability: string;
    }[];
    narrativeSignificance: string;
  };
}

export interface WorldCulture {
  societies: WorldElement[];
  customs: WorldElement[];
  religions: WorldElement[];
  politics: WorldElement[];
}

export interface WorldMagicSystem {
  rules: WorldElement[];
  elements: WorldElement[];
  practitioners: WorldElement[];
  limitations: WorldElement[];
}

export interface WorldTechnology {
  level: string;
  innovations: WorldElement[];
  impact: WorldElement[];
}

export interface GeneratedWorld {
  id?: string;
  name: string;
  description: string;
  geography: WorldGeography;
  culture: WorldCulture;
  magicSystem?: WorldMagicSystem;
  technology?: WorldTechnology;
  history: WorldElement[];
  conflicts: WorldElement[];
  createdAt?: string;
  updatedAt?: string;
}

export interface WorldGenerationParams {
  genre: NovelGenre;
  prompt: string;
  complexity: 'simple' | 'moderate' | 'complex';
  dimensionOptions: {
    // 地理维度
    geography: {
      enabled: boolean;
      terrain: boolean;
      climate: boolean;
      locations: boolean;
      spatialStructure: boolean;
    };
    // 文化维度
    culture: {
      enabled: boolean;
      societies: boolean;
      customs: boolean;
      religions: boolean;
      politics: boolean;
    };
    // 魔法维度
    magic: {
      enabled: boolean;
      rules: boolean;
      elements: boolean;
      practitioners: boolean;
      limitations: boolean;
    };
    // 科技维度
    technology: {
      enabled: boolean;
      innovations: boolean;
      impact: boolean;
    };
    // 历史和冲突维度
    narrative: {
      enabled: boolean;
      history: boolean;
      conflicts: boolean;
    };
  };
}

export interface WorldGeneratorResponse {
  world?: GeneratedWorld;
  error?: string;
} 