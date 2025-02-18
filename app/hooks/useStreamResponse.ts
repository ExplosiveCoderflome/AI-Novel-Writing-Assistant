import { useState, useCallback } from 'react';

interface StreamHookOptions {
  onContent?: (content: string, reasoningContent?: string) => void;
  onError?: (error: string) => void;
  onFinish?: () => void;
}

interface StreamHookReturn {
  isLoading: boolean;
  error: string | null;
  streamContent: string;
  streamReasoningContent: string;
  startStreaming: (url: string, body: any) => Promise<void>;
  stopStreaming: () => void;
}

export function useStreamResponse(options: StreamHookOptions = {}): StreamHookReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamContent, setStreamContent] = useState('');
  const [streamReasoningContent, setStreamReasoningContent] = useState('');
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const stopStreaming = useCallback(() => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
  }, [abortController]);

  const startStreaming = useCallback(async (url: string, body: any) => {
    setIsLoading(true);
    setError(null);
    setStreamContent('');
    setStreamReasoningContent('');

    const controller = new AbortController();
    setAbortController(controller);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法创建响应流读取器');
      }

      const decoder = new TextDecoder();
      let accumulatedContent = '';
      let accumulatedReasoningContent = '';
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            options.onFinish?.();
            break;
          }

          buffer += decoder.decode(value);
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim() === '') continue;
            
            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6);
              
              if (jsonStr === '[DONE]') {
                options.onFinish?.();
                continue;
              }

              try {
                const parsed = JSON.parse(jsonStr);
                
                if (parsed.error) {
                  setError(parsed.error);
                  options.onError?.(parsed.error);
                  continue;
                }

                const content = parsed.choices?.[0]?.delta?.content;
                const reasoningContent = parsed.choices?.[0]?.delta?.reasoning_content;

                if (content || reasoningContent) {
                  if (content) {
                    accumulatedContent += content;
                    setStreamContent(accumulatedContent);
                  }
                  
                  if (reasoningContent) {
                    accumulatedReasoningContent += reasoningContent;
                    setStreamReasoningContent(accumulatedReasoningContent);
                  }
                  
                  options.onContent?.(content || '', reasoningContent || '');
                }
              } catch (e) {
                console.warn('解析数据块失败:', e, jsonStr);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : '流式请求失败';
      setError(errorMessage);
      options.onError?.(errorMessage);
    } finally {
      setIsLoading(false);
      setAbortController(null);
    }
  }, [options]);

  return {
    isLoading,
    error,
    streamContent,
    streamReasoningContent,
    startStreaming,
    stopStreaming,
  };
} 