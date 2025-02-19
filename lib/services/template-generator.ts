/*
 * @LastEditors: biz
 */
import { NovelGenre } from '@prisma/client';
import { LLMFactory } from '../llm/factory';

export class TemplateGenerator {
  static async generateTemplate(genre: Pick<NovelGenre, 'name' | 'description'>) {
    const llm = LLMFactory.create('deepseek-reasoner');
    
    const prompt = `作为一个专业的小说角色设定专家，请为"${genre.name}"类型的小说生成一个详细的角色设定模板。
${genre.description ? `这个类型的特点是：${genre.description}\n` : ''}

请根据这个类型的特点，列出创建角色时需要填写的所有重要信息项。对于每个信息项：
1. 说明其重要性和在故事中的作用
2. 如果这个信息项对这个类型特别重要，请特别说明
3. 如果有选项类的信息，可以列出可能的选项

例如，对于"仙侠"类型：
- 修炼体系：决定角色的成长路线和战斗方式
- 法宝：重要的战斗和身份象征
- 境界：表明修为高低，影响故事发展

请详细列出"${genre.name}"类型小说角色需要的所有重要信息项。`;

    const response = await llm.generate(prompt);
    return response;
  }
} 