'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '../ui/card';
import { Label } from '../ui/label';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { WorldTypeOption } from '../../types/worldV2';

interface WorldTypeSelectorProps {
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export default function WorldTypeSelector({
  value,
  onChange,
  disabled = false
}: WorldTypeSelectorProps) {
  const [worldTypes, setWorldTypes] = useState<WorldTypeOption[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    // 这里可以从API获取世界类型列表，现在使用静态数据
    setWorldTypes([
      {
        id: 'fantasy',
        name: '奇幻世界',
        description: '充满魔法、神秘生物和超自然力量的世界'
      },
      {
        id: 'scifi',
        name: '科幻世界',
        description: '以先进科技、未来社会和太空探索为特色的世界'
      },
      {
        id: 'historical',
        name: '历史世界',
        description: '基于真实历史时期或事件的世界'
      },
      {
        id: 'modern',
        name: '现代世界',
        description: '设定在当代的世界，可能包含轻微的幻想或科幻元素'
      },
      {
        id: 'postapocalyptic',
        name: '后启示录世界',
        description: '灾难后的世界，人类文明面临重建或生存挑战'
      },
      {
        id: 'xianxia',
        name: '仙侠世界',
        description: '融合中国道教、仙道修炼和武术的幻想世界'
      },
      {
        id: 'xuanhuan',
        name: '玄幻世界',
        description: '拥有东方元素但更加奇幻化的世界，通常有独特的力量体系'
      },
      {
        id: 'custom',
        name: '自定义世界',
        description: '根据您的想法创建独特的世界'
      }
    ]);
    setIsLoading(false);
  }, []);

  // 选择世界类型
  const handleSelect = (typeId: string) => {
    onChange(typeId);
  };

  return (
    <Card className="w-full">
      <CardContent className="pt-6">
        <RadioGroup 
          value={value} 
          onValueChange={handleSelect}
          className="space-y-3"
          disabled={disabled || isLoading}
        >
          {isLoading ? (
            <div className="flex items-center justify-center p-4">加载世界类型中...</div>
          ) : (
            worldTypes.map(type => (
              <div 
                key={type.id} 
                className="flex items-start space-x-2 p-3 border rounded-md hover:bg-slate-50 cursor-pointer"
                onClick={() => !disabled && handleSelect(type.id)}
              >
                <RadioGroupItem value={type.id} id={`type-${type.id}`} className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor={`type-${type.id}`} className="font-medium text-base cursor-pointer">
                    {type.name}
                  </Label>
                  <p className="text-sm text-gray-500 mt-1">{type.description}</p>
                </div>
              </div>
            ))
          )}
        </RadioGroup>
      </CardContent>
    </Card>
  );
} 