/*
 * @LastEditors: biz
 */
export interface NovelOutline {
  // 核心设定
  core: {
    theme: string;          // 核心主题
    emotionalTone: string;  // 情感基调
    mainConflict: string;   // 核心矛盾
  };
  
  // 人物设定
  characters: {
    main: Array<{
      name: string;
      role: string;
      arc: string;         // 人物成长弧
      relationships: Array<{
        target: string;    // 关系对象
        type: string;      // 关系类型
        development: string; // 关系发展
      }>;
    }>;
    supporting: Array<{
      name: string;
      role: string;
      purpose: string;     // 角色作用
    }>;
  };
  
  // 情节结构
  plotStructure: {
    setup: {              // 起始阶段
      events: string[];
      goals: string[];
    };
    development: {        // 发展阶段
      mainPlot: {
        events: string[];
        conflicts: string[];
      };
      subplots: Array<{
        title: string;
        events: string[];
        connection: string; // 与主线的关联
      }>;
    };
    climax: {            // 高潮阶段
      events: string[];
      resolution: string;
    };
  };
  
  // 世界观设定
  worldBuilding: {
    background: string;   // 背景设定
    rules: string[];     // 世界规则
    elements: Array<{          // 重要元素
      name: string;
      description: string;
      significance: string;
    }>;
  };
  
  // 节奏控制
  pacing: {
    turning_points: Array<{    // 转折点
      position: string;  // 发生位置（如"前期"、"中期"、"后期"）
      event: string;     // 事件描述
      impact: string;    // 影响
    }>;
    tension_curve: Array<{     // 张力曲线
      phase: string;     // 阶段
      tension_level: number; // 张力等级（1-10）
      description: string;   // 描述
    }>;
  };
  
  // 关键节点
  plotNodes?: Array<{
    id: string;
    chapter: number;
    title: string;
    description: string;
    phase: string;
    importance: 1 | 2 | 3; // 1-普通 2-重要 3-关键
  }>;
  
  // 支线任务
  subplots?: Array<{
    id: string;
    title: string;
    type: 'romance' | 'powerup' | 'world' | 'character';
    description: string;
    position: string;
  }>;
}

export type NovelGenre = 
  | 'fantasy'
  | 'science_fiction'
  | 'historical'
  | 'contemporary'
  | 'mystery'
  | 'horror'
  | 'romance'
  | 'adventure'
  | 'dystopian'
  | 'urban_fantasy';

export interface GenreWorldFeatures {
  hasFantasyElements: boolean;
  hasTechnologyFocus: boolean;
  hasHistoricalContext: boolean;
  hasModernSetting: boolean;
  hasSupernatural: boolean;
  worldComplexity: 'low' | 'medium' | 'high';
  requiredElements: string[];
}

export const genreFeatures: Record<NovelGenre, GenreWorldFeatures> = {
  fantasy: {
    hasFantasyElements: true,
    hasTechnologyFocus: false,
    hasHistoricalContext: true,
    hasModernSetting: false,
    hasSupernatural: true,
    worldComplexity: 'high',
    requiredElements: ['magic_system', 'mythical_creatures', 'unique_geography']
  },
  science_fiction: {
    hasFantasyElements: false,
    hasTechnologyFocus: true,
    hasHistoricalContext: false,
    hasModernSetting: false,
    hasSupernatural: false,
    worldComplexity: 'high',
    requiredElements: ['advanced_technology', 'future_society', 'scientific_principles']
  },
  historical: {
    hasFantasyElements: false,
    hasTechnologyFocus: false,
    hasHistoricalContext: true,
    hasModernSetting: false,
    hasSupernatural: false,
    worldComplexity: 'medium',
    requiredElements: ['historical_accuracy', 'period_customs', 'real_locations']
  },
  contemporary: {
    hasFantasyElements: false,
    hasTechnologyFocus: false,
    hasHistoricalContext: false,
    hasModernSetting: true,
    hasSupernatural: false,
    worldComplexity: 'low',
    requiredElements: ['modern_society', 'current_issues', 'realistic_settings']
  },
  mystery: {
    hasFantasyElements: false,
    hasTechnologyFocus: false,
    hasHistoricalContext: false,
    hasModernSetting: true,
    hasSupernatural: false,
    worldComplexity: 'medium',
    requiredElements: ['crime_elements', 'investigation_settings', 'suspense_atmosphere']
  },
  horror: {
    hasFantasyElements: false,
    hasTechnologyFocus: false,
    hasHistoricalContext: false,
    hasModernSetting: true,
    hasSupernatural: true,
    worldComplexity: 'medium',
    requiredElements: ['dark_atmosphere', 'psychological_elements', 'threat_sources']
  },
  romance: {
    hasFantasyElements: false,
    hasTechnologyFocus: false,
    hasHistoricalContext: false,
    hasModernSetting: true,
    hasSupernatural: false,
    worldComplexity: 'low',
    requiredElements: ['relationship_dynamics', 'emotional_settings', 'social_contexts']
  },
  adventure: {
    hasFantasyElements: false,
    hasTechnologyFocus: false,
    hasHistoricalContext: false,
    hasModernSetting: true,
    hasSupernatural: false,
    worldComplexity: 'medium',
    requiredElements: ['exotic_locations', 'action_settings', 'journey_elements']
  },
  dystopian: {
    hasFantasyElements: false,
    hasTechnologyFocus: true,
    hasHistoricalContext: false,
    hasModernSetting: false,
    hasSupernatural: false,
    worldComplexity: 'high',
    requiredElements: ['oppressive_system', 'social_commentary', 'survival_elements']
  },
  urban_fantasy: {
    hasFantasyElements: true,
    hasTechnologyFocus: false,
    hasHistoricalContext: false,
    hasModernSetting: true,
    hasSupernatural: true,
    worldComplexity: 'high',
    requiredElements: ['hidden_magic', 'modern_supernatural', 'urban_setting']
  }
}; 