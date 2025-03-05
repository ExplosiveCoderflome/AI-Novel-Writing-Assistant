'use client';

import { Card, CardContent } from '../ui/card';
import { Label } from '../ui/label';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { WorldOptionRefinementLevel } from '../../types/worldV2';

interface RefinementLevelSelectorProps {
  value: WorldOptionRefinementLevel;
  onChange: (value: WorldOptionRefinementLevel) => void;
  disabled?: boolean;
}

export default function RefinementLevelSelector({
  value,
  onChange,
  disabled = false
}: RefinementLevelSelectorProps) {
  const refinementLevels = [
    {
      id: 'basic',
      name: '基础',
      description: '生成少量基本选项，快速创建世界框架'
    },
    {
      id: 'standard',
      name: '标准',
      description: '生成适量选项，平衡详细程度和创建速度'
    },
    {
      id: 'detailed',
      name: '详细',
      description: '生成大量详细选项，创建丰富而复杂的世界'
    }
  ];

  return (
    <Card className="w-full">
      <CardContent className="pt-6">
        <RadioGroup 
          value={value}
          onValueChange={(val) => onChange(val as WorldOptionRefinementLevel)}
          className="space-y-3"
          disabled={disabled}
        >
          {refinementLevels.map(level => (
            <div 
              key={level.id} 
              className="flex items-start space-x-2 p-3 border rounded-md hover:bg-slate-50 cursor-pointer"
              onClick={() => !disabled && onChange(level.id as WorldOptionRefinementLevel)}
            >
              <RadioGroupItem value={level.id} id={`level-${level.id}`} className="mt-1" />
              <div className="flex-1">
                <Label htmlFor={`level-${level.id}`} className="font-medium text-base cursor-pointer">
                  {level.name}
                </Label>
                <p className="text-sm text-gray-500 mt-1">{level.description}</p>
              </div>
            </div>
          ))}
        </RadioGroup>
      </CardContent>
    </Card>
  );
} 