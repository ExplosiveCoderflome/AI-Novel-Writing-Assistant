import React from 'react';
import { GeneratedWorld, WorldElement } from '../types/world';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { Button } from './ui/button';
import { useState } from 'react';
import { toast } from './ui/use-toast';

interface WorldDisplayProps {
  world: GeneratedWorld;
  hideActions?: boolean;
}

const ElementDisplay: React.FC<{ elements?: WorldElement[] }> = ({ elements = [] }) => {
  if (!elements || elements.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无数据</p>;
  }

  // 属性名称映射表
  const attributeNameMap: Record<string, string> = {
    // 通用属性
    age: '年龄',
    size: '规模',
    population: '人口',
    influence: '影响力',
    power: '力量',
    status: '状态',
    type: '类型',
    origin: '起源',
    duration: '持续时间',
    range: '范围',
    cost: '代价',
    requirement: '要求',
    effect: '效果',
    weakness: '弱点',
    strength: '优势',
    features: '特征',
    function: '功能',
    availability: '可用性',
    limitations: '限制',
    social: '社会影响',
    economic: '经济影响',
    environmental: '环境影响',
    period: '时期',
    legacy: '遗产',
    parties: '参与方',
    causes: '原因',
    
    // 地理相关
    area: '面积',
    climate: '气候',
    resources: '资源',
    terrain: '地形',
    elevation: '海拔',
    vegetation: '植被',
    habitability: '宜居性',
    seasons: '季节',
    extremes: '极端情况',
    effects: '影响',
    spatial_type: '空间类型',
    spatial_connection: '空间连接',
    spatial_boundary: '空间边界',
    spatial_flow: '空间流动性',
    spatial_hierarchy: '空间层级',
    spatial_interaction: '空间互动',
    spatial_perception: '空间感知',
    spatial_symbolism: '空间象征',
    spatial_narrative: '空间叙事',
    spatial_transformation: '空间转化',
    spatial_accessibility: '可达性',
    spatial_continuity: '空间连续性',
    spatial_heterogeneity: '空间异质性',
    spatial_integration: '空间整合度',
    
    // 文化相关
    language: '语言',
    tradition: '传统',
    belief: '信仰',
    custom: '习俗',
    hierarchy: '等级制度',
    organization: '组织结构',
    structure: '结构',
    values: '价值观',
    customs: '习俗',
    practice: '实践',
    practices: '实践活动',
    beliefs: '信仰体系',
    
    // 魔法相关
    element: '元素',
    source: '魔力来源',
    limitation: '限制',
    side_effect: '副作用',
    casting_time: '施法时间',
    
    // 科技相关
    tech_level: '技术水平',
    complexity: '复杂度',
    advancement: '进步程度',
    application: '应用领域',
    impact: '影响',
    
    // 政治相关
    leadership: '领导制度',
    government: '政体',
    law: '法律',
    laws: '法律体系',
    military: '军事',
    diplomacy: '外交',
    
    // 经济相关
    economy: '经济',
    trade: '贸易',
    currency: '货币',
    wealth: '财富',
    
    // 社会相关
    social_class: '社会阶层',
    education: '教育',
    lifestyle: '生活方式',
    occupation: '职业',
    
    // 宗教相关
    deity: '神祇',
    ritual: '仪式',
    doctrine: '教义',
    worship: '崇拜方式'
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      {elements.map((element, index) => (
        <Card key={index} className="bg-muted/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{element.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">{element.description}</p>
            {element.significance && (
              <p className="text-sm text-primary">
                <span className="font-medium">重要性：</span>
                {element.significance}
              </p>
            )}
            {element.attributes && Object.entries(element.attributes).length > 0 && (
              <div>
                <span className="text-sm font-medium">属性：</span>
                <div className="space-y-1 mt-1">
                  {Object.entries(element.attributes).map(([key, value]) => (
                    <div key={key} className="text-sm flex">
                      <span className="font-medium min-w-[80px]">{attributeNameMap[key] || key}：</span>
                      <span className="flex-1">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-2xl font-bold mb-4 mt-8 pb-2 border-b">{children}</h2>
);

const SubSectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-xl font-semibold mb-3 text-primary">{children}</h3>
);

export function WorldDisplay({ world, hideActions }: WorldDisplayProps) {
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const response = await fetch('/api/worlds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(world),
      });

      if (!response.ok) {
        throw new Error('保存世界失败');
      }

      toast({
        title: '保存成功',
        description: '世界设定已成功保存',
      });
    } catch (error) {
      toast({
        title: '保存失败',
        description: error instanceof Error ? error.message : '保存世界时发生未知错误',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="border-b bg-muted/50">
        <CardTitle className="text-3xl">{world.name}</CardTitle>
        <CardDescription className="text-lg mt-2">{world.description}</CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        <ScrollArea className="h-[800px] pr-4">
          <div className="space-y-2">
            {/* 地理环境 */}
            {world.geography && (
              <section>
                <SectionTitle>地理环境</SectionTitle>
                <div className="space-y-6">
                  <div>
                    <SubSectionTitle>地形</SubSectionTitle>
                    <ElementDisplay elements={world.geography.terrain} />
                  </div>
                  <div>
                    <SubSectionTitle>气候</SubSectionTitle>
                    <ElementDisplay elements={world.geography.climate} />
                  </div>
                  <div>
                    <SubSectionTitle>重要地点</SubSectionTitle>
                    <ElementDisplay elements={world.geography.locations} />
                  </div>
                </div>
              </section>
            )}

            {/* 文化社会 */}
            {world.culture && (
              <section>
                <SectionTitle>文化社会</SectionTitle>
                <div className="space-y-6">
                  <div>
                    <SubSectionTitle>社会结构</SubSectionTitle>
                    <ElementDisplay elements={world.culture.societies} />
                  </div>
                  <div>
                    <SubSectionTitle>习俗传统</SubSectionTitle>
                    <ElementDisplay elements={world.culture.customs} />
                  </div>
                  <div>
                    <SubSectionTitle>宗教信仰</SubSectionTitle>
                    <ElementDisplay elements={world.culture.religions} />
                  </div>
                  <div>
                    <SubSectionTitle>政治体系</SubSectionTitle>
                    <ElementDisplay elements={world.culture.politics} />
                  </div>
                </div>
              </section>
            )}

            {/* 魔法系统 */}
            {world.magicSystem && (
              <section>
                <SectionTitle>魔法系统</SectionTitle>
                <div className="space-y-6">
                  <div>
                    <SubSectionTitle>规则法则</SubSectionTitle>
                    <ElementDisplay elements={world.magicSystem.rules} />
                  </div>
                  <div>
                    <SubSectionTitle>魔法元素</SubSectionTitle>
                    <ElementDisplay elements={world.magicSystem.elements} />
                  </div>
                  <div>
                    <SubSectionTitle>施法者</SubSectionTitle>
                    <ElementDisplay elements={world.magicSystem.practitioners} />
                  </div>
                  <div>
                    <SubSectionTitle>限制条件</SubSectionTitle>
                    <ElementDisplay elements={world.magicSystem.limitations} />
                  </div>
                </div>
              </section>
            )}

            {/* 科技发展 */}
            {world.technology && (
              <section>
                <SectionTitle>科技发展</SectionTitle>
                <div className="space-y-6">
                  <div>
                    <SubSectionTitle>技术水平</SubSectionTitle>
                    <Card className="bg-muted/50">
                      <CardContent className="pt-6">
                        <p className="text-lg">{world.technology.level}</p>
                      </CardContent>
                    </Card>
                  </div>
                  <div>
                    <SubSectionTitle>创新发明</SubSectionTitle>
                    <ElementDisplay elements={world.technology.innovations} />
                  </div>
                  <div>
                    <SubSectionTitle>社会影响</SubSectionTitle>
                    <ElementDisplay elements={world.technology.impact} />
                  </div>
                </div>
              </section>
            )}

            {/* 历史背景 */}
            {world.history && world.history.length > 0 && (
              <section>
                <SectionTitle>历史背景</SectionTitle>
                <ElementDisplay elements={world.history} />
              </section>
            )}

            {/* 当前冲突 */}
            {world.conflicts && world.conflicts.length > 0 && (
              <section>
                <SectionTitle>当前冲突</SectionTitle>
                <ElementDisplay elements={world.conflicts} />
              </section>
            )}
          </div>
        </ScrollArea>
        {!hideActions && (
          <CardFooter className="mt-6 px-0">
            <Button 
              onClick={handleSave} 
              disabled={isSaving}
              className="w-full"
            >
              {isSaving ? '保存中...' : '保存世界'}
            </Button>
          </CardFooter>
        )}
      </CardContent>
    </Card>
  );
} 