export interface Novel {
  id: string;
  title: string;
  description: string;
  genreId?: string;
  genre?: NovelGenre;
  coverImage?: string;
  createdAt: Date;
  updatedAt: Date;
  authorId: string;
  status: 'draft' | 'published';
  outline?: string;
  reasoningContent?: string;
  chapters?: Chapter[];
  characters?: Character[];
  structuredOutline?: OutlineNode[];
  developmentDirection?: string;
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
  template?: string;
}

export interface OutlineNode {
  id: string;
  type: string;
  content: string;
  children?: OutlineNode[];
}