/**
 * LangChain流式响应处理工具
 * 用于处理流式数据响应，实现流式数据的日志记录、错误处理等功能
 */

import { BaseCallbackHandler, CallbackHandlerMethods } from "@langchain/core/callbacks/base";
import { StreamChunk } from '../../app/types/llm';
import { ChatDeepSeek } from "@langchain/deepseek";

/**
 * 流响应控制器
 */
export interface StreamController {
  enqueue: (chunk: StreamChunk) => void;
  close: () => void;
  error: (err: Error) => void;
}

/**
 * 流式响应选项
 */
export interface StreamOptions {
  onStart?: () => void;
  onChunk?: (chunk: StreamChunk) => void;
  onComplete?: (fullContent: string) => void;
  onError?: (error: Error) => void;
}

/**
 * 创建可流式UI处理器
 * 用于处理LangChain模型的流式响应
 */
export function createStreamableUI() {
  let content = "";
  let controller: StreamController | null = null;
  
  const tokenCallbacks: ((token: string) => void)[] = [];
  const finalCallbacks: ((content: string) => void)[] = [];
  const errorCallbacks: ((error: Error) => void)[] = [];
  
  /**
   * 注册新token回调
   */
  const onNewToken = (callback: (token: string) => void) => {
    tokenCallbacks.push(callback);
  };
  
  /**
   * 注册最终内容回调
   */
  const onFinal = (callback: (content: string) => void) => {
    finalCallbacks.push(callback);
  };
  
  /**
   * 流式回调处理器
   */
  class StreamingCallbackHandler extends BaseCallbackHandler implements CallbackHandlerMethods {
    name = "StreamingCallbackHandler";
    
    constructor() {
      super();
    }
    
    /**
     * 处理新生成的token
     */
    async handleLLMNewToken(token: string) {
      try {
        console.log("收到新token:", token);
        content += token;
        
        // 通知所有注册的回调
        tokenCallbacks.forEach(callback => {
          try {
            callback(token);
          } catch (err) {
            console.error("token回调处理错误:", err);
          }
        });
        
        // 如果有控制器，则发送块
        if (controller) {
          controller.enqueue({ type: "content", content: token });
        }
      } catch (err) {
        console.error("处理新token时出错:", err);
      }
    }
    
    /**
     * 处理LLM生成结束
     */
    async handleLLMEnd() {
      try {
        console.log("LLM生成完成, 最终内容长度:", content.length);
        
        // 通知所有最终回调
        finalCallbacks.forEach(callback => {
          try {
            callback(content);
          } catch (err) {
            console.error("最终内容回调处理错误:", err);
          }
        });
        
        // 关闭控制器
        if (controller) {
          controller.close();
        }
      } catch (err) {
        console.error("处理生成结束时出错:", err);
      }
    }
    
    /**
     * 处理LLM错误
     */
    async handleLLMError(error: Error) {
      try {
        console.error("LLM处理错误:", error);
        
        // 通知所有错误回调
        errorCallbacks.forEach(callback => {
          try {
            callback(error);
          } catch (err) {
            console.error("错误回调处理错误:", err);
          }
        });
        
        // 如果有控制器，则发送错误
        if (controller) {
          controller.error(error);
        }
      } catch (err) {
        console.error("处理错误回调时出错:", err);
      }
    }
  }
  
  return {
    /**
     * 开始流处理
     */
    start(c: StreamController) {
      content = "";
      controller = c;
      console.log("流处理开始");
      return new StreamingCallbackHandler();
    },
    
    /**
     * 取消流处理
     */
    cancel(reason: string) {
      console.log("流处理取消:", reason);
      if (controller) {
        const error = new Error(`流处理已取消: ${reason}`);
        controller.error(error);
        controller = null;
      }
    },
    
    /**
     * 手动添加流块
     */
    enqueue(chunk: StreamChunk) {
      try {
        const token = typeof chunk === 'string' ? chunk : chunk.content || '';
        
        // 累积内容
        content += token;
        
        // 通知token回调
        tokenCallbacks.forEach(callback => {
          try {
            callback(token);
          } catch (err) {
            console.error("token回调处理错误:", err);
          }
        });
        
        // 控制器发送块
        if (controller) {
          controller.enqueue(chunk);
        }
      } catch (err) {
        console.error("手动添加流块时出错:", err);
        if (controller) {
          controller.error(err instanceof Error ? err : new Error(String(err)));
        }
      }
    },
    
    /**
     * 关闭流处理
     */
    close() {
      try {
        console.log("流处理关闭, 最终内容长度:", content.length);
        
        // 通知最终回调
        finalCallbacks.forEach(callback => {
          try {
            callback(content);
          } catch (err) {
            console.error("最终内容回调处理错误:", err);
          }
        });
        
        // 关闭控制器
        if (controller) {
          controller.close();
          controller = null;
        }
      } catch (err) {
        console.error("关闭流时出错:", err);
        if (controller) {
          controller.error(err instanceof Error ? err : new Error(String(err)));
          controller = null;
        }
      }
    },
    
    onNewToken,
    onFinal,
    
    /**
     * 注册错误回调
     */
    onError(callback: (error: Error) => void) {
      errorCallbacks.push(callback);
    },
    
    /**
     * 获取累积的内容
     */
    getContent() {
      return content;
    }
  };
}

/**
 * 创建流式响应处理器
 * @param callbacks 各阶段的回调函数
 * @returns ReadableStream 和控制器
 */
export function createStreamableResponse(
  callbacks?: StreamOptions
): { stream: ReadableStream<Uint8Array>; controller: StreamController } {
  console.log('创建流式响应处理器');
  
  let fullContent = '';
  let controller: ReadableStreamController<Uint8Array> | null = null;
  
  // 创建ReadableStream
  const stream = new ReadableStream({
    start(c) {
      controller = c;
      if (callbacks?.onStart) {
        callbacks.onStart();
      }
      console.log('流式响应开始');
    },
    cancel(reason) {
      console.log('流式响应取消', reason);
    }
  });
  
  // 创建流控制器
  const streamController: StreamController = {
    enqueue(chunk: StreamChunk) {
      try {
        console.log('处理流数据块:', {
          type: chunk.type,
          contentLength: chunk.content?.length || 0,
          hasReasoningContent: !!chunk.reasoning_content
        });
        
        if (callbacks?.onChunk) {
          callbacks.onChunk(chunk);
        }
        
        if (chunk.type === 'content' && chunk.content) {
          fullContent += chunk.content;
        }
        
        // 转换为JSON字符串并编码
        const chunkData = JSON.stringify(chunk);
        const encoder = new TextEncoder();
        // 添加换行符以确保每个JSON对象单独成行
        const encodedChunk = encoder.encode(chunkData + '\n');
        
        if (controller) {
          controller.enqueue(encodedChunk);
        }
      } catch (error) {
        console.error('流数据块处理错误:', error);
        this.error(error instanceof Error ? error : new Error(String(error)));
      }
    },
    
    close() {
      try {
        console.log('关闭流式响应, 总内容长度:', fullContent.length);
        
        if (callbacks?.onComplete) {
          callbacks.onComplete(fullContent);
        }
        
        if (controller) {
          controller.close();
        }
      } catch (error) {
        console.error('关闭流响应错误:', error);
        this.error(error instanceof Error ? error : new Error(String(error)));
      }
    },
    
    error(err: Error) {
      console.error('流式响应错误:', err);
      
      if (callbacks?.onError) {
        callbacks.onError(err);
      }
      
      const errorChunk: StreamChunk = {
        type: 'error',
        content: err.message
      };
      
      try {
        const errorData = JSON.stringify(errorChunk);
        const encoder = new TextEncoder();
        const encodedError = encoder.encode(errorData);
        
        if (controller) {
          controller.enqueue(encodedError);
          controller.close();
        }
      } catch (encodingError) {
        console.error('错误编码失败:', encodingError);
        if (controller) {
          controller.error(encodingError);
        }
      }
    }
  };
  
  return { stream, controller: streamController };
}

/**
 * 处理流式响应
 * @param stream 流式响应
 * @returns 处理后的内容
 */
export async function handleStreamResponse(stream: ReadableStream<Uint8Array>): Promise<string> {
  console.log('开始处理流式响应');
  
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = '';
  
  try {
    let done = false;
    
    while (!done) {
      const { value, done: isDone } = await reader.read();
      done = isDone;
      
      if (value) {
        const decodedChunk = decoder.decode(value, { stream: !done });
        console.log('接收到流数据:', {
          chunkSize: value.length,
          decodedLength: decodedChunk.length
        });
        
        try {
          const jsonChunk = JSON.parse(decodedChunk) as StreamChunk;
          
          if (jsonChunk.type === 'content') {
            result += jsonChunk.content || '';
          } else if (jsonChunk.type === 'error') {
            console.error('流数据错误:', jsonChunk.content);
            throw new Error(jsonChunk.content);
          }
          
          // 记录解析后的数据
          console.log('解析流数据:', {
            type: jsonChunk.type,
            contentLength: jsonChunk.content?.length || 0
          });
        } catch (parseError) {
          console.error('JSON解析错误:', parseError, '原始数据:', decodedChunk);
          throw new Error(`流数据解析失败: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
        }
      }
    }
    
    console.log('流式响应处理完成, 总内容长度:', result.length);
    return result;
  } catch (error) {
    console.error('处理流式响应错误:', error);
    throw error;
  } finally {
    reader.releaseLock();
  }
} 