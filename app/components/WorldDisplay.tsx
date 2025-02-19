import React from 'react';
import { GeneratedWorld, WorldElement } from '../types/world';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';

interface WorldDisplayProps {
  world: GeneratedWorld;
}

const ElementDisplay: React.FC<{ elements: WorldElement[] }> = ({ elements }) => {
  return (
    <div className="space-y-2">
      {elements.map((element, index) => (
        <div key={index} className="border rounded-lg p-3 bg-muted/50">
          <h4 className="font-medium">{element.name}</h4>
          <p className="text-sm text-muted-foreground mt-1">{element.description}</p>
          {element.significance && (
            <p className="text-sm text-primary mt-2">
              <span className="font-medium">重要性：</span>
              {element.significance}
            </p>
          )}
          {Object.entries(element.attributes).length > 0 && (
            <div className="mt-2">
              <span className="text-sm font-medium">属性：</span>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {Object.entries(element.attributes).map(([key, value]) => (
                  <div key={key} className="text-sm">
                    <span className="font-medium">{key}:</span> {value}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export const WorldDisplay: React.FC<WorldDisplayProps> = ({ world }) => {
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>{world.name}</CardTitle>
        <p className="text-muted-foreground">{world.description}</p>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[600px] pr-4">
          <Accordion type="single" collapsible className="space-y-4">
            <AccordionItem value="geography">
              <AccordionTrigger>地理环境</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">地形</h4>
                    <ElementDisplay elements={world.geography.terrain} />
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">气候</h4>
                    <ElementDisplay elements={world.geography.climate} />
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">重要地点</h4>
                    <ElementDisplay elements={world.geography.locations} />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="culture">
              <AccordionTrigger>文化社会</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">社会结构</h4>
                    <ElementDisplay elements={world.culture.societies} />
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">习俗传统</h4>
                    <ElementDisplay elements={world.culture.customs} />
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">宗教信仰</h4>
                    <ElementDisplay elements={world.culture.religions} />
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">政治体系</h4>
                    <ElementDisplay elements={world.culture.politics} />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {world.magicSystem && (
              <AccordionItem value="magic">
                <AccordionTrigger>魔法系统</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium mb-2">规则法则</h4>
                      <ElementDisplay elements={world.magicSystem.rules} />
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">魔法元素</h4>
                      <ElementDisplay elements={world.magicSystem.elements} />
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">施法者</h4>
                      <ElementDisplay elements={world.magicSystem.practitioners} />
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">限制条件</h4>
                      <ElementDisplay elements={world.magicSystem.limitations} />
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}

            {world.technology && (
              <AccordionItem value="technology">
                <AccordionTrigger>科技发展</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4">
                    <div className="border rounded-lg p-3 bg-muted/50">
                      <h4 className="font-medium">技术水平</h4>
                      <p className="text-sm text-muted-foreground mt-1">{world.technology.level}</p>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">创新发明</h4>
                      <ElementDisplay elements={world.technology.innovations} />
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">社会影响</h4>
                      <ElementDisplay elements={world.technology.impact} />
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}

            <AccordionItem value="history">
              <AccordionTrigger>历史背景</AccordionTrigger>
              <AccordionContent>
                <ElementDisplay elements={world.history} />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="conflicts">
              <AccordionTrigger>当前冲突</AccordionTrigger>
              <AccordionContent>
                <ElementDisplay elements={world.conflicts} />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}; 