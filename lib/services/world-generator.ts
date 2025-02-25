import { BaseLLM } from '../llm/base';
import { WorldGenerationParams, GeneratedWorld, WorldGeneratorResponse } from '../../app/types/world';
import { genreFeatures, NovelGenre } from '../../app/types/novel';

export class WorldGenerator {
  private llm: BaseLLM;

  constructor(llm: BaseLLM) {
    this.llm = llm;
  }

  private generateSystemPrompt(params: WorldGenerationParams): string {
    const { genre, emphasis } = params;
    const features = genreFeatures[genre as NovelGenre];

    let prompt = `You are a world-building expert specializing in creating detailed and coherent fictional worlds for ${genre.replace('_', ' ')} novels. 
    
Create a comprehensive world with the following characteristics:
${features.requiredElements.map(elem => `- ${elem.replace('_', ' ')}`).join('\n')}

The world should reflect these features:
- ${features.hasFantasyElements ? 'Include fantasy and magical elements' : 'Maintain realistic principles'}
- ${features.hasTechnologyFocus ? 'Focus on technological advancement and its impact' : 'Technology plays a minor role'}
- ${features.hasHistoricalContext ? 'Include historical context and period-appropriate elements' : 'Focus on the present or future'}
- ${features.hasModernSetting ? 'Set in a modern or contemporary context' : 'Set in a different time period'}
- ${features.hasSupernatural ? 'Include supernatural elements' : 'Exclude supernatural elements'}

Complexity level: ${params.complexity}

${emphasis ? 'Special emphasis on:' + 
  (emphasis.geography ? '\n- Detailed geography and physical world' : '') +
  (emphasis.culture ? '\n- Rich cultural and societal elements' : '') +
  (emphasis.magic ? '\n- Comprehensive magic system' : '') +
  (emphasis.technology ? '\n- Advanced technological framework' : '')
  : ''}

Format the response as a structured world description with these sections:
1. World Overview
2. Geography and Environment
3. Cultural and Social Structure
4. ${features.hasFantasyElements ? 'Magic System' : features.hasTechnologyFocus ? 'Technology' : 'Power Structure'}
5. History and Background
6. Current Conflicts and Tensions

Each section should be detailed and interconnected, creating a cohesive world that serves as a compelling setting for a ${genre.replace('_', ' ')} novel.`;

    return prompt;
  }

  private generateUserPrompt(params: WorldGenerationParams): string {
    return `Please create a detailed world based on the following additional requirements and elements:

${params.prompt}

Ensure the world remains consistent with the genre conventions while incorporating these specific elements.`;
  }

  async generateWorld(params: WorldGenerationParams): Promise<WorldGeneratorResponse> {
    try {
      const systemPrompt = this.generateSystemPrompt(params);
      const userPrompt = this.generateUserPrompt(params);

      const response = await this.llm.generateRecommendation({
        systemPrompt,
        userPrompt,
        temperature: 0.8,
        maxTokens: 3000
      });

      if (response.error) {
        return { error: response.error };
      }

      if (!response.content) {
        return { error: '世界生成失败：没有收到有效的响应' };
      }

      // 这里需要解析LLM返回的文本内容，将其转换为结构化的世界数据
      // 实际实现中可能需要更复杂的解析逻辑
      const parsedWorld = this.parseWorldResponse(response.content, params.genre);
      
      return { world: parsedWorld };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : '世界生成过程中发生未知错误'
      };
    }
  }

  private parseWorldResponse(content: string, genre: NovelGenre): GeneratedWorld {
    // 这里是一个简单的实现，实际应用中需要更复杂的解析逻辑
    const sections = content.split(/\d\./);
    
    return {
      name: "Generated World", // 这里应该从内容中提取
      description: sections[1]?.trim() || "A new world",
      geography: {
        terrain: this.parseElements(sections[2] || "", "terrain"),
        climate: this.parseElements(sections[2] || "", "climate"),
        locations: this.parseElements(sections[2] || "", "locations")
      },
      culture: {
        societies: this.parseElements(sections[3] || "", "societies"),
        customs: this.parseElements(sections[3] || "", "customs"),
        religions: this.parseElements(sections[3] || "", "religions"),
        politics: this.parseElements(sections[3] || "", "politics")
      },
      ...(genreFeatures[genre].hasFantasyElements && {
        magicSystem: {
          rules: this.parseElements(sections[4] || "", "rules"),
          elements: this.parseElements(sections[4] || "", "elements"),
          practitioners: this.parseElements(sections[4] || "", "practitioners"),
          limitations: this.parseElements(sections[4] || "", "limitations")
        }
      }),
      ...(genreFeatures[genre].hasTechnologyFocus && {
        technology: {
          level: this.extractTechnologyLevel(sections[4] || ""),
          innovations: this.parseElements(sections[4] || "", "innovations"),
          impact: this.parseElements(sections[4] || "", "impact")
        }
      }),
      history: this.parseElements(sections[5] || "", "history"),
      conflicts: this.parseElements(sections[6] || "", "conflicts")
    };
  }

  private parseElements(content: string, category: string): Array<{
    name: string;
    description: string;
    significance: string;
    attributes: Record<string, string>;
  }> {
    // 尝试从内容中提取结构化信息
    try {
      // 检查内容是否包含 JSON 格式的数据
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const jsonData = JSON.parse(jsonMatch[0]);
          if (Array.isArray(jsonData)) {
            return jsonData;
          } else if (jsonData[category] && Array.isArray(jsonData[category])) {
            return jsonData[category];
          }
        } catch (e) {
          console.warn(`解析 JSON 失败: ${e}`);
        }
      }

      // 尝试根据类别提取相关段落
      const categoryRegex = new RegExp(`${category}[\\s\\S]*?(?=\\n\\n|$)`, 'i');
      const categoryMatch = content.match(categoryRegex);
      
      if (categoryMatch) {
        const categoryContent = categoryMatch[0];
        
        // 尝试提取结构化信息
        const elements = [];
        
        // 提取名称、描述和重要性
        const nameMatch = categoryContent.match(/名称[：:]\s*(.+?)(?=\n|$)/i);
        const descMatch = categoryContent.match(/描述[：:]\s*(.+?)(?=\n|$)/i);
        const sigMatch = categoryContent.match(/(?:重要性|意义|影响)[：:]\s*(.+?)(?=\n|$)/i);
        
        const name = nameMatch ? nameMatch[1].trim() : category;
        const description = descMatch ? descMatch[1].trim() : categoryContent.trim();
        const significance = sigMatch ? sigMatch[1].trim() : "重要的世界元素";
        
        // 提取属性
        const attributes: Record<string, string> = {};
        
        // 常见属性关键词
        const attributeKeywords = {
          societies: ["structure", "values", "customs", "hierarchy", "organization"],
          customs: ["origin", "practice", "impact", "tradition", "ritual"],
          religions: ["beliefs", "practices", "influence", "deity", "doctrine"],
          politics: ["structure", "leadership", "laws", "government", "military"]
        };
        
        // 根据类别选择相关属性关键词
        const relevantKeywords = attributeKeywords[category as keyof typeof attributeKeywords] || [];
        
        // 尝试提取属性
        relevantKeywords.forEach(keyword => {
          const attrRegex = new RegExp(`${keyword}[：:]\s*(.+?)(?=\n|$)`, 'i');
          const attrMatch = categoryContent.match(attrRegex);
          if (attrMatch) {
            attributes[keyword] = attrMatch[1].trim();
          }
        });
        
        elements.push({
          name,
          description,
          significance,
          attributes
        });
        
        return elements;
      }
    } catch (error) {
      console.error(`解析元素时出错: ${error}`);
    }
    
    // 如果所有尝试都失败，返回简单的默认值
    return [{
      name: category,
      description: content.trim() || `${category} 的详细描述`,
      significance: "To be determined",
      attributes: {}
    }];
  }

  private extractTechnologyLevel(content: string): string {
    // 简单的实现，实际应用中需要更复杂的解析逻辑
    return content.includes("advanced") ? "Advanced" : 
           content.includes("modern") ? "Modern" : 
           "Basic";
  }
} 