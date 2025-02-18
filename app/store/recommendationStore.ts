import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Tag {
  id: string;
  name: string;
  type: string;
}

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  tags: Tag[];
  imageUrl?: string;
}

interface RecommendationStore {
  favorites: Recommendation[];
  toggleFavorite: (recommendation: Recommendation) => void;
  removeFavorite: (id: string) => void;
  clearFavorites: () => void;
}

export const useRecommendationStore = create<RecommendationStore>()(
  persist(
    (set) => ({
      favorites: [],
      toggleFavorite: (recommendation) =>
        set((state) => {
          const exists = state.favorites.some((fav) => fav.id === recommendation.id);
          if (exists) {
            return {
              favorites: state.favorites.filter((fav) => fav.id !== recommendation.id),
            };
          }
          return {
            favorites: [...state.favorites, recommendation],
          };
        }),
      removeFavorite: (id) =>
        set((state) => ({
          favorites: state.favorites.filter((fav) => fav.id !== id),
        })),
      clearFavorites: () => set({ favorites: [] }),
    }),
    {
      name: 'recommendation-store',
    }
  )
); 