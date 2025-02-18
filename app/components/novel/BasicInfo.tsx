import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { GenreSelector } from '../GenreSelector';
import { toast } from 'sonner';
import { NovelGenre } from '../../api/novel/types';

interface BasicInfoProps {
  title: string;
  description: string;
  genreId: string;
  loading?: boolean;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onGenreChange: (value: string) => void;
}

const BasicInfo: React.FC<BasicInfoProps> = ({
  title,
  description,
  genreId,
  loading = false,
  onTitleChange,
  onDescriptionChange,
  onGenreChange,
}) => {
  const [genres, setGenres] = useState<NovelGenre[]>([]);
  const [isLoadingGenres, setIsLoadingGenres] = useState(false);

  useEffect(() => {
    fetchGenres();
  }, []);

  const fetchGenres = async () => {
    setIsLoadingGenres(true);
    try {
      const response = await fetch('/api/genres');
      if (!response.ok) {
        throw new Error('获取类型列表失败');
      }
      const data = await response.json();
      setGenres(data);
    } catch (error) {
      console.error('获取类型列表失败:', error);
      toast.error('获取类型列表失败');
    } finally {
      setIsLoadingGenres(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>基本信息</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="title">标题</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            disabled={loading}
            placeholder="请输入小说标题..."
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="description">简介</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            disabled={loading}
            placeholder="请输入小说简介..."
            className="min-h-[100px]"
          />
        </div>

        <div className="space-y-2">
          <Label>类型</Label>
          <GenreSelector
            value={genreId}
            onChange={onGenreChange}
            genres={genres}
            disabled={loading || isLoadingGenres}
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default BasicInfo; 