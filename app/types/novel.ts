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
} 