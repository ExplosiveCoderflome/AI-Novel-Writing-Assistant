/*
 * @LastEditors: biz
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface Tag {
  id: string;
  name: string;
  type: 'movie' | 'book' | 'music' | 'article' | 'website';
}

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  tags: Tag[];
  imageUrl?: string;
}

interface RecommendationState {
  selectedTags: Tag[];
  customTags: Tag[];
  favorites: Recommendation[];
  recommendations: Recommendation[];
  selectedLLM: string;
  searchKeyword: string;
  addTag: (tag: Tag) => void;
  removeTag: (tagId: string) => void;
  addCustomTag: (name: string, type: Tag['type']) => void;
  toggleFavorite: (recommendation: Recommendation) => void;
  setRecommendations: (recommendations: Recommendation[]) => void;
  setSelectedLLM: (llm: string) => void;
  setSearchKeyword: (keyword: string) => void;
}

export const useRecommendationStore = create<RecommendationState>()(
  persist(
    (set) => ({
      selectedTags: [],
      customTags: [],
      favorites: [],
      recommendations: [],
      selectedLLM: 'deepseek',
      searchKeyword: '',
      addTag: (tag) =>
        set((state) => ({
          selectedTags: [...state.selectedTags, tag],
        })),
      removeTag: (tagId) =>
        set((state) => ({
          selectedTags: state.selectedTags.filter((tag) => tag.id !== tagId),
        })),
      addCustomTag: (name, type) =>
        set((state) => {
          const newTag: Tag = {
            id: `custom-${Date.now()}`,
            name,
            type,
          };
          return {
            customTags: [...state.customTags, newTag],
            selectedTags: [...state.selectedTags, newTag],
          };
        }),
      toggleFavorite: (recommendation) =>
        set((state) => {
          const isFavorite = state.favorites.some((fav) => fav.id === recommendation.id);
          return {
            favorites: isFavorite
              ? state.favorites.filter((fav) => fav.id !== recommendation.id)
              : [...state.favorites, recommendation],
          };
        }),
      setRecommendations: (recommendations) =>
        set(() => ({
          recommendations,
        })),
      setSelectedLLM: (llm) =>
        set(() => ({
          selectedLLM: llm,
        })),
      setSearchKeyword: (keyword) =>
        set(() => ({
          searchKeyword: keyword,
        })),
    }),
    {
      name: 'recommendation-store',
      storage: createJSONStorage(() => {
        if (typeof window !== 'undefined') {
          return localStorage;
        }
        return {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        };
      }),
    }
  )
); 