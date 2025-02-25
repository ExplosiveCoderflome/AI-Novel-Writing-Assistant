import React, { useState, useEffect } from 'react';
import { GeneratedWorld, WorldElement } from '../types/world';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { Button } from './ui/button';
import { toast } from './ui/use-toast';
import { AttributeRefinement } from './world/AttributeRefinement';

// 属性名称映射表
const ATTRIBUTE_NAME_MAP: Record<string, string> = {
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
  worship: '崇拜方式',
  cultural_impact: '文化影响',
  narrative_role: '叙事作用'
} as const;

interface WorldDisplayProps {
  world: GeneratedWorld;
  hideActions?: boolean;
}

interface ElementDisplayProps {
  elements?: WorldElement[];
  onElementClick?: (element: WorldElement, type: string) => void;
  selectedElement?: WorldElement;
  elementType?: string;
}

const ElementDisplay: React.FC<ElementDisplayProps> = ({ 
  elements = [], 
  onElementClick,
  selectedElement,
  elementType = 'default'
}) => {
  if (!elements || elements.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无数据</p>;
  }

  return (
    <div className={`grid grid-cols-1 ${elements.length > 1 ? 'md:grid-cols-2' : ''} gap-4`}>
      {elements.map((element, index) => (
        <Card 
          key={index} 
          className={`bg-muted/50 ${onElementClick ? 'cursor-pointer hover:bg-muted' : ''} ${
            selectedElement === element ? 'ring-2 ring-primary' : ''
          }`}
          onClick={() => onElementClick?.(element, elementType)}
        >
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
                      <span className="font-medium min-w-[80px]">{ATTRIBUTE_NAME_MAP[key] || key}：</span>
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

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="text-2xl font-bold mb-4 mt-8 pb-2 border-b">{children}</h2>
);

const SubSectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="text-xl font-semibold mb-3 text-primary">{children}</h3>
);

export function WorldDisplay({ world, hideActions }: WorldDisplayProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [selectedElement, setSelectedElement] = useState<WorldElement>();
  const [selectedElementType, setSelectedElementType] = useState<string>();
  const [localWorld, setLocalWorld] = useState<GeneratedWorld>(world);

  // 添加自动保存功能
  useEffect(() => {
    const saveWorld = async () => {
      if (!localWorld.id) return; // 如果没有 id，不执行保存
      if (localWorld.id !== world.id) return; // 防止初始化时触发
      await handleSave();
    };

    const timeoutId = setTimeout(saveWorld, 500); // 延迟500ms后保存
    return () => clearTimeout(timeoutId);
  }, [localWorld]); // 当 localWorld 变化时触发

  console.log('WorldDisplay rendered:', {
    worldId: world.id,
    localWorldId: localWorld.id,
    hasSelectedElement: !!selectedElement,
    selectedElementType,
  });

  const handleElementClick = (element: WorldElement, type: string) => {
    setSelectedElement(element);
    setSelectedElementType(type);
  };

  const handleElementUpdate = (updatedElement: WorldElement) => {
    if (!selectedElementType || !selectedElement) return;

    // 创建世界数据的深拷贝
    const newWorld = JSON.parse(JSON.stringify(localWorld)) as GeneratedWorld;

    // 根据元素类型更新相应的数组
    switch (selectedElementType) {
      case 'terrain':
        if (newWorld.geography?.terrain) {
          const index = newWorld.geography.terrain.findIndex(e => e.name === selectedElement.name);
          if (index !== -1) {
            newWorld.geography.terrain[index] = updatedElement;
          }
        }
        break;
      case 'climate':
        if (newWorld.geography?.climate) {
          const index = newWorld.geography.climate.findIndex(e => e.name === selectedElement.name);
          if (index !== -1) {
            newWorld.geography.climate[index] = updatedElement;
          }
        }
        break;
      case 'locations':
        if (newWorld.geography?.locations) {
          const index = newWorld.geography.locations.findIndex(e => e.name === selectedElement.name);
          if (index !== -1) {
            newWorld.geography.locations[index] = updatedElement;
          }
        }
        break;
      case 'societies':
        if (newWorld.culture?.societies) {
          const index = newWorld.culture.societies.findIndex(e => e.name === selectedElement.name);
          if (index !== -1) {
            newWorld.culture.societies[index] = updatedElement;
          }
        }
        break;
      case 'customs':
        if (newWorld.culture?.customs) {
          const index = newWorld.culture.customs.findIndex(e => e.name === selectedElement.name);
          if (index !== -1) {
            newWorld.culture.customs[index] = updatedElement;
          }
        }
        break;
      case 'religions':
        if (newWorld.culture?.religions) {
          const index = newWorld.culture.religions.findIndex(e => e.name === selectedElement.name);
          if (index !== -1) {
            newWorld.culture.religions[index] = updatedElement;
          }
        }
        break;
      case 'politics':
        if (newWorld.culture?.politics) {
          const index = newWorld.culture.politics.findIndex(e => e.name === selectedElement.name);
          if (index !== -1) {
            newWorld.culture.politics[index] = updatedElement;
          }
        }
        break;
      case 'rules':
        if (newWorld.magicSystem?.rules) {
          const index = newWorld.magicSystem.rules.findIndex(e => e.name === selectedElement.name);
          if (index !== -1) {
            newWorld.magicSystem.rules[index] = updatedElement;
          }
        }
        break;
      case 'elements':
        if (newWorld.magicSystem?.elements) {
          const index = newWorld.magicSystem.elements.findIndex(e => e.name === selectedElement.name);
          if (index !== -1) {
            newWorld.magicSystem.elements[index] = updatedElement;
          }
        }
        break;
      case 'practitioners':
        if (newWorld.magicSystem?.practitioners) {
          const index = newWorld.magicSystem.practitioners.findIndex(e => e.name === selectedElement.name);
          if (index !== -1) {
            newWorld.magicSystem.practitioners[index] = updatedElement;
          }
        }
        break;
      case 'limitations':
        if (newWorld.magicSystem?.limitations) {
          const index = newWorld.magicSystem.limitations.findIndex(e => e.name === selectedElement.name);
          if (index !== -1) {
            newWorld.magicSystem.limitations[index] = updatedElement;
          }
        }
        break;
      case 'innovations':
        if (newWorld.technology?.innovations) {
          const index = newWorld.technology.innovations.findIndex(e => e.name === selectedElement.name);
          if (index !== -1) {
            newWorld.technology.innovations[index] = updatedElement;
          }
        }
        break;
      case 'impact':
        if (newWorld.technology?.impact) {
          const index = newWorld.technology.impact.findIndex(e => e.name === selectedElement.name);
          if (index !== -1) {
            newWorld.technology.impact[index] = updatedElement;
          }
        }
        break;
      case 'history':
        if (newWorld.history) {
          const index = newWorld.history.findIndex(e => e.name === selectedElement.name);
          if (index !== -1) {
            newWorld.history[index] = updatedElement;
          }
        }
        break;
      case 'conflicts':
        if (newWorld.conflicts) {
          const index = newWorld.conflicts.findIndex(e => e.name === selectedElement.name);
          if (index !== -1) {
            newWorld.conflicts[index] = updatedElement;
          }
        }
        break;
    }

    // 更新本地状态
    setLocalWorld(newWorld);
    // 更新选中的元素
    setSelectedElement(updatedElement);

    toast({
      title: '更新成功',
      description: '元素细化内容已更新',
    });
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const endpoint = localWorld.id ? '/api/worlds/update' : '/api/worlds/create';
      const method = localWorld.id ? 'PUT' : 'POST';

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(localWorld),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '保存世界失败');
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || '保存世界失败');
      }

      toast({
        title: '保存成功',
        description: '世界设定已成功保存到数据库',
      });
    } catch (error) {
      console.error('保存世界失败:', error);
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
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="xl:col-span-2">
        <Card>
          <CardHeader className="border-b bg-muted/50">
            <CardTitle className="text-3xl">{localWorld.name}</CardTitle>
            <CardDescription className="text-lg mt-2">{localWorld.description}</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <ScrollArea className="h-[800px] pr-4">
              <div className="space-y-2">
                {/* 地理环境 */}
                {localWorld.geography && (
                  <section>
                    <SectionTitle>地理环境</SectionTitle>
                    <div className="space-y-6">
                      <div>
                        <SubSectionTitle>地形</SubSectionTitle>
                        <div className={`grid grid-cols-1 ${localWorld.geography.terrain.length > 1 ? 'md:grid-cols-2' : ''} gap-4`}>
                          {localWorld.geography.terrain.map((element, index) => (
                            <Card 
                              key={index} 
                              className={`bg-muted/50 cursor-pointer transition-colors hover:bg-muted ${
                                selectedElement === element ? 'ring-2 ring-primary' : ''
                              }`}
                              onClick={() => handleElementClick(element, 'terrain')}
                            >
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
                                          <span className="font-medium min-w-[80px]">{ATTRIBUTE_NAME_MAP[key] || key}：</span>
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
                      </div>
                      <div>
                        <SubSectionTitle>气候</SubSectionTitle>
                        <div className={`grid grid-cols-1 ${localWorld.geography.climate.length > 1 ? 'md:grid-cols-2' : ''} gap-4`}>
                          {localWorld.geography.climate.map((element, index) => (
                            <Card 
                              key={index} 
                              className={`bg-muted/50 cursor-pointer transition-colors hover:bg-muted ${
                                selectedElement === element ? 'ring-2 ring-primary' : ''
                              }`}
                              onClick={() => handleElementClick(element, 'climate')}
                            >
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
                                          <span className="font-medium min-w-[80px]">{ATTRIBUTE_NAME_MAP[key] || key}：</span>
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
                      </div>
                      <div>
                        <SubSectionTitle>重要地点</SubSectionTitle>
                        <ElementDisplay 
                          elements={localWorld.geography.locations} 
                          onElementClick={handleElementClick} 
                          selectedElement={selectedElement}
                          elementType="locations"
                        />
                      </div>
                    </div>
                  </section>
                )}

                {/* 文化社会 */}
                {localWorld.culture && (
                  <section>
                    <SectionTitle>文化社会</SectionTitle>
                    <div className="space-y-6">
                      <div>
                        <SubSectionTitle>社会结构</SubSectionTitle>
                        <ElementDisplay 
                          elements={localWorld.culture.societies} 
                          onElementClick={handleElementClick} 
                          selectedElement={selectedElement}
                          elementType="societies"
                        />
                      </div>
                      <div>
                        <SubSectionTitle>习俗传统</SubSectionTitle>
                        <ElementDisplay 
                          elements={localWorld.culture.customs} 
                          onElementClick={handleElementClick} 
                          selectedElement={selectedElement}
                          elementType="customs"
                        />
                      </div>
                      <div>
                        <SubSectionTitle>宗教信仰</SubSectionTitle>
                        <ElementDisplay 
                          elements={localWorld.culture.religions} 
                          onElementClick={handleElementClick} 
                          selectedElement={selectedElement}
                          elementType="religions"
                        />
                      </div>
                      <div>
                        <SubSectionTitle>政治体系</SubSectionTitle>
                        <ElementDisplay 
                          elements={localWorld.culture.politics} 
                          onElementClick={handleElementClick} 
                          selectedElement={selectedElement}
                          elementType="politics"
                        />
                      </div>
                    </div>
                  </section>
                )}

                {/* 魔法系统 */}
                {localWorld.magicSystem && (
                  <section>
                    <SectionTitle>魔法系统</SectionTitle>
                    <div className="space-y-6">
                      <div>
                        <SubSectionTitle>规则法则</SubSectionTitle>
                        <ElementDisplay 
                          elements={localWorld.magicSystem.rules} 
                          onElementClick={handleElementClick} 
                          selectedElement={selectedElement}
                          elementType="rules"
                        />
                      </div>
                      <div>
                        <SubSectionTitle>魔法元素</SubSectionTitle>
                        <ElementDisplay 
                          elements={localWorld.magicSystem.elements} 
                          onElementClick={handleElementClick} 
                          selectedElement={selectedElement}
                          elementType="elements"
                        />
                      </div>
                      <div>
                        <SubSectionTitle>施法者</SubSectionTitle>
                        <ElementDisplay 
                          elements={localWorld.magicSystem.practitioners} 
                          onElementClick={handleElementClick} 
                          selectedElement={selectedElement}
                          elementType="practitioners"
                        />
                      </div>
                      <div>
                        <SubSectionTitle>限制条件</SubSectionTitle>
                        <ElementDisplay 
                          elements={localWorld.magicSystem.limitations} 
                          onElementClick={handleElementClick} 
                          selectedElement={selectedElement}
                          elementType="limitations"
                        />
                      </div>
                    </div>
                  </section>
                )}

                {/* 科技发展 */}
                {localWorld.technology && (
                  <section>
                    <SectionTitle>科技发展</SectionTitle>
                    <div className="space-y-6">
                      <div>
                        <SubSectionTitle>技术水平</SubSectionTitle>
                        <Card className="bg-muted/50">
                          <CardContent className="pt-6">
                            <p className="text-lg">{localWorld.technology.level}</p>
                          </CardContent>
                        </Card>
                      </div>
                      <div>
                        <SubSectionTitle>创新发明</SubSectionTitle>
                        <ElementDisplay 
                          elements={localWorld.technology.innovations} 
                          onElementClick={handleElementClick} 
                          selectedElement={selectedElement}
                          elementType="innovations"
                        />
                      </div>
                      <div>
                        <SubSectionTitle>社会影响</SubSectionTitle>
                        <ElementDisplay 
                          elements={localWorld.technology.impact} 
                          onElementClick={handleElementClick} 
                          selectedElement={selectedElement}
                          elementType="impact"
                        />
                      </div>
                    </div>
                  </section>
                )}

                {/* 历史背景 */}
                {localWorld.history && localWorld.history.length > 0 && (
                  <section>
                    <SectionTitle>历史背景</SectionTitle>
                    <ElementDisplay 
                      elements={localWorld.history} 
                      onElementClick={handleElementClick} 
                      selectedElement={selectedElement}
                      elementType="history"
                    />
                  </section>
                )}

                {/* 当前冲突 */}
                {localWorld.conflicts && localWorld.conflicts.length > 0 && (
                  <section>
                    <SectionTitle>当前冲突</SectionTitle>
                    <ElementDisplay 
                      elements={localWorld.conflicts} 
                      onElementClick={handleElementClick} 
                      selectedElement={selectedElement}
                      elementType="conflicts"
                    />
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
      </div>
      
      <div className="xl:col-span-1">
        <AttributeRefinement
          selectedElement={selectedElement}
          elementType={selectedElementType}
          onUpdate={handleElementUpdate}
          world={localWorld}
        />
      </div>
    </div>
  );
} 