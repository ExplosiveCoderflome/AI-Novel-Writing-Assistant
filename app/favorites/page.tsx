'use client';

import { HeartIcon, ShareIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import Masonry from 'react-masonry-css';
import { useRecommendationStore } from '../store/recommendation';
import { Card, CardContent, CardFooter, CardHeader } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { useToast } from "../components/ui/use-toast";

const FavoritesPage = () => {
  const { favorites, toggleFavorite } = useRecommendationStore();
  const { toast } = useToast();

  const breakpointCols = {
    default: 4,
    1100: 3,
    700: 2,
    500: 1,
  };

  if (favorites.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container py-10">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">我的收藏</h1>
            <p className="text-muted-foreground">暂无收藏内容</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-10">
        <h1 className="text-2xl font-bold mb-8 text-center">我的收藏</h1>
        <Masonry
          breakpointCols={breakpointCols}
          className="flex -ml-4 w-auto"
          columnClassName="pl-4 bg-clip-padding"
        >
          {favorites.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="mb-4"
            >
              <Card>
                {item.imageUrl && (
                  <div className="relative pt-[56.25%] overflow-hidden rounded-t-lg">
                    <img
                      alt={item.title}
                      src={item.imageUrl}
                      className="absolute inset-0 w-full h-full object-cover transition-transform hover:scale-105"
                    />
                  </div>
                )}
                <CardHeader>
                  <h3 className="text-lg font-semibold line-clamp-1">{item.title}</h3>
                  <p className="text-muted-foreground line-clamp-2">{item.description}</p>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {item.tags.map((tag) => (
                      <span
                        key={tag.id}
                        className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80"
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                </CardContent>
                <CardFooter className="justify-end space-x-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleFavorite(item)}
                  >
                    <HeartIcon className="h-5 w-5 fill-red-500 text-red-500" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      toast({
                        title: "分享功能开发中",
                        description: "该功能即将上线",
                      });
                    }}
                  >
                    <ShareIcon className="h-5 w-5" />
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          ))}
        </Masonry>
      </div>
    </div>
  );
};

export default FavoritesPage; 