import { useState } from 'react';
import { WorldPropertyOption } from '@/types/worldV2';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '../ui/card';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Checkbox } from '../ui/checkbox';
import { Badge } from '../ui/badge';
import { BookmarkPlus, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface PropertyOptionCardProps {
  option: WorldPropertyOption;
  selected: boolean;
  detail: string;
  worldType: string;
  onSelect: (id: string, selected: boolean) => void;
  onDetailChange: (id: string, detail: string) => void;
  disabled?: boolean;
}

export default function PropertyOptionCard({
  option,
  selected,
  detail,
  worldType,
  onSelect,
  onDetailChange,
  disabled = false,
}: PropertyOptionCardProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  
  // 保存到属性库
  const handleSaveToLibrary = async () => {
    if (isSaving || isSaved) return;
    
    setIsSaving(true);
    
    try {
      const response = await fetch('/api/worlds/v2/property-library', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          property: option,
          worldType,
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setIsSaved(true);
        toast.success('已保存到属性库');
      } else {
        toast.error(`保存失败: ${data.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('保存到属性库失败:', error);
      toast.error('保存到属性库失败');
    } finally {
      setIsSaving(false);
    }
  };
  
  return (
    <Card className={`h-full flex flex-col ${selected ? 'border-primary' : ''}`}>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div className="flex items-center space-x-2">
            <Checkbox
              id={`check-${option.id}`}
              checked={selected}
              onCheckedChange={(checked: boolean) => onSelect(option.id, checked)}
              disabled={disabled}
            />
            <CardTitle className="text-lg">{option.name}</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSaveToLibrary}
            disabled={isSaving || isSaved || disabled}
            title="保存到属性库"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isSaved ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <BookmarkPlus className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-grow pb-2">
        <p className="text-sm text-muted-foreground mb-4">{option.description}</p>
        {selected && (
          <div className="mt-2">
            <Textarea
              placeholder="添加详细说明..."
              value={detail}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onDetailChange(option.id, e.target.value)}
              disabled={disabled}
              className="min-h-24"
            />
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Badge variant="outline" className="text-xs">
          {option.category || '通用'}
        </Badge>
      </CardFooter>
    </Card>
  );
} 