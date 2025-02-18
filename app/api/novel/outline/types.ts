export interface LLMResponse {
  content: string | null;
  error?: string;
}

export interface ErrorResponse {
  error: string;
  type: string;
  details?: string;
  solution?: string;
  next_steps?: string[];
} 