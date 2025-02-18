export interface Novel {
  id: string;
  title: string;
  description: string;
  genre: string;
  coverImage?: string;
  createdAt: Date;
  updatedAt: Date;
  authorId: string;
  status: 'draft' | 'published';
  outline?: string;
  reasoningContent?: string;
  chapters?: Chapter[];
  characters?: Character[];
}

export interface Character {
  id: string;
  name: string;
  role: string;
  personality: string;
  background: string;
  development: string;
  novelId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Chapter {
  id: string;
  title: string;
  content: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
  novelId: string;
}

export interface AIAssistRequest {
  type: 'plot' | 'character' | 'style' | 'optimization';
  content: string;
  context?: string;
}

export interface AIAssistResponse {
  suggestions: string[];
  explanation?: string;
}

export interface NovelGenre {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  parentId?: string | null;
  children?: NovelGenre[];
  fullPath?: string;
}