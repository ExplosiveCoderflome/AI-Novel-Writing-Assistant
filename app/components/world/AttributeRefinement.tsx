import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { WorldElement } from '../../types/world';
import { LLMPromptInput } from '../LLMPromptInput';
import { ScrollArea } from '../ui/scroll-area';
import { toast } from '../ui/use-toast';
import { Loader2 } from 'lucide-react';
import { GeneratedWorld } from '../../types/world';

interface AttributeRefinementProps {
  selectedElement?: WorldElement;
  elementType?: string;
  onUpdate?: (updatedElement: WorldElement) => void;
  world: GeneratedWorld;
}

export function AttributeRefinement({
  selectedElement,
  elementType,
  onUpdate,
  world
}: AttributeRefinementProps) {
  const [isRefining, setIsRefining] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [refinedElement, setRefinedElement] = useState<WorldElement | null>(null);

  const handleRefine = async (params: { 
    provider: string; 
    model: string; 
    prompt: string;
    temperature?: number;
    maxTokens?: number;
  }) => {
    if (!selectedElement) return;

    try {
      setIsRefining(true);
      setRefinedElement(null);

      const response = await fetch('/api/worlds/refine-attribute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...params,
          elementType,
          element: selectedElement,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '属性细化失败');
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || '属性细化失败');
      }

      setRefinedElement(data.data);

      toast({
        title: '细化成功',
        description: '请检查细化结果，确认后点击保存',
      });
    } catch (error) {
      console.error('属性细化失败:', error);
      toast({
        title: '细化失败',
        description: error instanceof Error ? error.message : '属性细化时发生未知错误',
        variant: 'destructive',
      });
    } finally {
      setIsRefining(false);
    }
  };

  const handleSave = async () => {
    console.log('handleSave triggered', {
      hasRefinedElement: !!refinedElement,
      hasOnUpdate: !!onUpdate,
      hasWorld: !!world,
      hasElementType: !!elementType,
      hasSelectedElement: !!selectedElement,
      worldId: world?.id,
    });

    if (!refinedElement || !onUpdate || !world || !elementType || !selectedElement) {
      console.log('Save cancelled: missing required props');
      return;
    }

    try {
      console.log('Setting isSaving to true');
      setIsSaving(true);

      // 先更新父组件的状态
      onUpdate(refinedElement);
      
      // 清除本地状态
      setRefinedElement(null);
      
      toast({
        title: '保存成功',
        description: '细化属性已保存',
      });
    } catch (error) {
      console.error('保存失败:', error);
      toast({
        title: '保存失败',
        description: error instanceof Error ? error.message : '保存到数据库时发生错误',
        variant: 'destructive',
      });
    } finally {
      console.log('Setting isSaving to false');
      setIsSaving(false);
    }
  };

  if (!selectedElement) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>属性细化</CardTitle>
          <CardDescription>
            请在左侧选择需要细化的属性
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>属性细化 - {selectedElement.name}</CardTitle>
        <CardDescription>
          对选中的属性进行深入扩写和细化
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <h4 className="font-medium">当前描述</h4>
          <ScrollArea className="h-[100px] w-full rounded-md border p-2">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {selectedElement.description}
            </p>
          </ScrollArea>
        </div>

        <div className="space-y-2">
          <h4 className="font-medium">重要性</h4>
          <ScrollArea className="h-[60px] w-full rounded-md border p-2">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {selectedElement.significance}
            </p>
          </ScrollArea>
        </div>

        {selectedElement.attributes && Object.entries(selectedElement.attributes).length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium">现有属性</h4>
            <div className="rounded-md border p-2 space-y-1">
              {Object.entries(selectedElement.attributes).map(([key, value]) => (
                <div key={key} className="text-sm flex">
                  <span className="font-medium min-w-[100px]">{key}：</span>
                  <span className="text-muted-foreground">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {refinedElement && (
          <div className="space-y-4 pt-4 border-t">
            <h4 className="font-medium text-lg text-primary">细化结果</h4>
            
            <div className="space-y-2">
              <h5 className="font-medium">更新后的描述</h5>
              <ScrollArea className="h-[100px] w-full rounded-md border p-2">
                <p className="text-sm whitespace-pre-wrap">
                  {refinedElement.description}
                </p>
              </ScrollArea>
            </div>

            <div className="space-y-2">
              <h5 className="font-medium">更新后的重要性</h5>
              <ScrollArea className="h-[60px] w-full rounded-md border p-2">
                <p className="text-sm whitespace-pre-wrap">
                  {refinedElement.significance}
                </p>
              </ScrollArea>
            </div>

            {refinedElement.attributes && Object.entries(refinedElement.attributes).length > 0 && (
              <div className="space-y-2">
                <h5 className="font-medium">更新后的属性</h5>
                <div className="rounded-md border p-2 space-y-1">
                  {Object.entries(refinedElement.attributes).map(([key, value]) => (
                    <div key={key} className="text-sm flex">
                      <span className="font-medium min-w-[100px]">{key}：</span>
                      <span>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button 
              className="w-full mt-4" 
              onClick={(e) => {
                console.log('Save button clicked');
                handleSave();
              }}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  保存中...
                </>
              ) : (
                '保存更新'
              )}
            </Button>
          </div>
        )}

        <div className="pt-4">
          <LLMPromptInput
            inputType="textarea"
            buttonText={isRefining ? "细化中..." : "开始细化"}
            disabled={isRefining || isSaving}
            onSubmit={handleRefine}
          />
        </div>
      </CardContent>
    </Card>
  );
} 