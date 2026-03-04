export interface World {
  id: string;
  name: string;
  description?: string | null;
  background?: string | null;
  geography?: string | null;
  cultures?: string | null;
  magicSystem?: string | null;
  politics?: string | null;
  races?: string | null;
  religions?: string | null;
  technology?: string | null;
  conflicts?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorldPropertyLibrary {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  worldType?: string | null;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}
