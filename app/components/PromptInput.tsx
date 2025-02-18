'use client';

import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';

interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  description?: string;
}

export function PromptInput({
  value,
  onChange,
  placeholder = '请输入提示词...',
  label = 'AI 提示词',
  description = '请描述你想要生成的大纲内容，越详细越好。AI 将根据你的描述生成相应的大纲。'
}: PromptInputProps) {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid w-full gap-2">
          <Textarea
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="min-h-[200px] resize-y"
          />
        </div>
      </CardContent>
    </Card>
  );
} 