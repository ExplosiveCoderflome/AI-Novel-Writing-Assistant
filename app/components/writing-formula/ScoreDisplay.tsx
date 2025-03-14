import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../ui/card';
import { Progress } from '../ui/progress';
import { Badge } from '../ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { Button } from '../ui/button';
import { ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { cn } from '../../../lib/utils';

interface ScoreItemProps {
  name: string;
  score: number;
  comment: string;
  maxScore?: number;
}

interface ScoreDisplayProps {
  scoreData: {
    total_score?: number;
    score_items?: ScoreItemProps[];
    overall_feedback?: string;
    improvement_suggestions?: string[];
    error?: string;
  } | null;
  isGenerationMode: boolean;
  isLoading: boolean;
  fullResponse?: string;
}

const getScoreColor = (score: number): string => {
  if (score >= 80) return 'bg-green-500';
  if (score >= 60) return 'bg-yellow-500';
  if (score >= 40) return 'bg-orange-500';
  return 'bg-red-500';
};

const ScoreDisplay: React.FC<ScoreDisplayProps> = ({
  scoreData,
  isGenerationMode,
  isLoading,
  fullResponse,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>内容评分</CardTitle>
          <CardDescription>
            正在评估内容与写作公式的符合度...
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span>分析进行中</span>
              <span>请稍候...</span>
            </div>
            <Progress value={65} className="w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!scoreData) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>内容评分</CardTitle>
          <CardDescription>
            无法获取评分数据
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>错误</AlertTitle>
            <AlertDescription>
              无法加载评分数据，请重试。
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (scoreData.error) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>内容评分</CardTitle>
          <CardDescription>
            评分过程中发生错误
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>错误</AlertTitle>
            <AlertDescription>
              {scoreData.error}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const totalScore = scoreData.total_score || 0;
  const scoreItems = scoreData.score_items || [];
  const overallFeedback = scoreData.overall_feedback || '';
  const improvementSuggestions = scoreData.improvement_suggestions || [];

  const scoreColor = getScoreColor(totalScore);

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>内容评分结果</CardTitle>
            <CardDescription>
              {isGenerationMode ? '生成内容与写作公式符合度评分' : '改写内容与写作公式符合度评分'}
            </CardDescription>
          </div>
          <div className={`text-3xl font-bold text-white rounded-full w-16 h-16 flex items-center justify-center ${scoreColor}`}>
            {totalScore}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <h3 className="text-lg font-medium">评分明细</h3>
          <div className="space-y-3">
            {scoreItems.map((item, index) => (
              <div key={index} className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="font-medium">{item.name}</span>
                  <Badge variant={item.score >= 8 ? "default" : item.score >= 6 ? "outline" : "destructive"}>
                    {item.score}/10
                  </Badge>
                </div>
                <Progress value={item.score * 10} className="w-full h-2" />
                <p className="text-sm text-muted-foreground">{item.comment}</p>
              </div>
            ))}
          </div>
        </div>
        
        <div className="space-y-2">
          <h3 className="text-lg font-medium">总体评价</h3>
          <p className="text-sm">{overallFeedback}</p>
        </div>
        
        {improvementSuggestions.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-lg font-medium">改进建议</h3>
            <ul className="list-disc list-inside text-sm space-y-1">
              {improvementSuggestions.map((suggestion, index) => (
                <li key={index}>{suggestion}</li>
              ))}
            </ul>
          </div>
        )}

        {fullResponse && (
          <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">查看完整评分报告</h3>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm">
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent className="mt-2">
              <div className="bg-muted p-3 rounded-md text-xs font-mono whitespace-pre-wrap overflow-auto max-h-60">
                {fullResponse}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
      <CardFooter>
        <p className="text-xs text-muted-foreground">评分仅供参考，最终判断应结合实际需求和创作目标。</p>
      </CardFooter>
    </Card>
  );
};

export default ScoreDisplay; 