/*
 * @LastEditors: biz
 */
import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Loader2 } from 'lucide-react';
import { useToast } from './ui/use-toast';

export function Chat() {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    try {
      setLoading(true);
      const res = await fetch('/api/llm/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      });

      const data = await res.json();

      if (data.success) {
        setResponse(data.data.content);
      } else {
        toast({
          title: '生成失败',
          description: data.error || '未知错误',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Chat error:', error);
      toast({
        title: '请求失败',
        description: '请检查网络连接',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="输入你的问题..."
          disabled={loading}
        />
        <Button type="submit" disabled={loading || !prompt.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : '发送'}
        </Button>
      </form>
      {response && (
        <div className="p-4 rounded-lg bg-secondary">
          <p className="whitespace-pre-wrap">{response}</p>
        </div>
      )}
    </div>
  );
} 