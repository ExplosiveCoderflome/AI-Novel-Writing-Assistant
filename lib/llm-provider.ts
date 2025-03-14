import fetch from 'node-fetch';

// 定义响应类型
interface LLMResponse {
  choices: {
    message: {
      content: string;
      function_call?: {
        name: string;
        arguments: string;
      };
    };
  }[];
}

// 定义基础LLM提供商接口
export interface LLMProvider {
  generate(options: any): Promise<string>;
  generateStream(options: any): Promise<any>;
  generateWithFunction(options: any): Promise<any>;
}

// DeepSeek API实现
export class DeepSeekProvider implements LLMProvider {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY || '';
    this.baseUrl = 'https://api.deepseek.com/v1';
  }

  async generate(options: any): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model || 'deepseek-chat',
        messages: options.messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 800,
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.json() as any;
      throw new Error(`DeepSeek API错误: ${JSON.stringify(error)}`);
    }

    const data = await response.json() as LLMResponse;
    return data.choices[0].message.content;
  }

  async generateStream(options: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model || 'deepseek-chat',
        messages: options.messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 800,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.json() as any;
      throw new Error(`DeepSeek API错误: ${JSON.stringify(error)}`);
    }

    return response.body;
  }

  async generateWithFunction(options: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model || 'deepseek-chat',
        messages: options.messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 800,
        functions: options.functions,
        function_call: options.function_call,
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.json() as any;
      throw new Error(`DeepSeek API错误: ${JSON.stringify(error)}`);
    }

    const data = await response.json() as LLMResponse;
    return data.choices[0].message;
  }
}

// OpenAI API实现
export class OpenAIProvider implements LLMProvider {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || '';
    this.baseUrl = 'https://api.openai.com/v1';
  }

  async generate(options: any): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model || 'gpt-3.5-turbo',
        messages: options.messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 800,
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.json() as any;
      throw new Error(`OpenAI API错误: ${JSON.stringify(error)}`);
    }

    const data = await response.json() as LLMResponse;
    return data.choices[0].message.content;
  }

  async generateStream(options: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model || 'gpt-3.5-turbo',
        messages: options.messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 800,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.json() as any;
      throw new Error(`OpenAI API错误: ${JSON.stringify(error)}`);
    }

    return response.body;
  }

  async generateWithFunction(options: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model || 'gpt-3.5-turbo',
        messages: options.messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 800,
        functions: options.functions,
        function_call: options.function_call,
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.json() as any;
      throw new Error(`OpenAI API错误: ${JSON.stringify(error)}`);
    }

    const data = await response.json() as LLMResponse;
    return data.choices[0].message;
  }
}

// 提供商工厂函数
export function getLLMProvider(provider: string): LLMProvider | null {
  switch (provider.toLowerCase()) {
    case 'deepseek':
      return new DeepSeekProvider();
    case 'openai':
      return new OpenAIProvider();
    default:
      console.error(`不支持的提供商: ${provider}`);
      return null;
  }
} 