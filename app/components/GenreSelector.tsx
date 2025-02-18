'use client';

import { useState, useEffect, useMemo } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { ChevronRight, ChevronDown, Search, X } from 'lucide-react';
import { NovelGenre } from '../api/novel/types';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from './ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './ui/popover';

// 扩展 NovelGenre 类型以包含内部使用的属性
interface ExtendedNovelGenre extends NovelGenre {
  fullPath?: string;
  path?: string;
}

interface GenreSelectorProps {
  value?: string;
  onChange: (value: string) => void;
  genres?: NovelGenre[];
  placeholder?: string;
  disabled?: boolean;
}

export function GenreSelector({ 
  value, 
  onChange, 
  genres = [], 
  placeholder = '选择小说类型',
  disabled = false 
}: GenreSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGenres, setExpandedGenres] = useState<Set<string>>(() => {
    // 初始化时展开所有一级类型
    return new Set(genres.map(genre => genre.id));
  });
  const [selectedGenre, setSelectedGenre] = useState<ExtendedNovelGenre | null>(null);

  // 重置展开状态
  const resetExpanded = () => {
    setExpandedGenres(new Set(genres.map(genre => genre.id)));
  };

  // 当弹出层打开时重置展开状态
  useEffect(() => {
    if (open) {
      resetExpanded();
    }
  }, [open]);

  // 监听展开状态变化
  useEffect(() => {
    console.log('Expanded genres updated:', Array.from(expandedGenres));
  }, [expandedGenres]);

  // 扁平化所有类型，用于搜索
  const flattenedGenres = useMemo(() => {
    const flattened: ExtendedNovelGenre[] = [];
    const flatten = (genre: NovelGenre, parentNames: string[] = [], path: string = '') => {
      const currentPath = path ? `${path}-${genre.id}` : genre.id;
      const fullPath = [...parentNames, genre.name].join(' > ');
      flattened.push({ ...genre, fullPath, path: currentPath });
      if (genre.children) {
        genre.children.forEach(child => flatten(child, [...parentNames, genre.name], currentPath));
      }
    };
    genres.forEach(genre => flatten(genre));
    return flattened;
  }, [genres]);

  // 根据 ID 查找类型
  const findGenreById = (id: string): ExtendedNovelGenre | null => {
    return flattenedGenres.find(genre => genre.id === id) || null;
  };

  // 当外部 value 改变时，更新选中的类型
  useEffect(() => {
    if (value) {
      const genre = findGenreById(value);
      setSelectedGenre(genre);
    } else {
      setSelectedGenre(null);
    }
  }, [value]);

  // 切换类型的展开/折叠状态
  const toggleGenreExpand = (genreId: string) => {
    console.log('Toggle called for genre:', genreId);
    setExpandedGenres(prev => {
      const newSet = new Set(prev);
      if (newSet.has(genreId)) {
        console.log('Collapsing genre:', genreId);
        newSet.delete(genreId);
      } else {
        console.log('Expanding genre:', genreId);
        newSet.add(genreId);
      }
      return newSet;
    });
  };

  // 处理类型选择
  const handleSelect = (genre: ExtendedNovelGenre) => {
    setSelectedGenre(genre);
    onChange(genre.id);
    setOpen(false);
  };

  // 清除选择
  const handleClear = () => {
    setSelectedGenre(null);
    onChange('');
    setSearchQuery('');
  };

  // 渲染类型树节点
  const renderGenreTree = (genre: ExtendedNovelGenre, level: number = 0, parentPath: string = '') => {
    const isExpanded = expandedGenres.has(genre.id);
    const hasChildren = genre.children && genre.children.length > 0;
    const paddingLeft = level * 12;
    const currentPath = parentPath ? `${parentPath}-${genre.id}` : genre.id;

    return (
      <div key={currentPath} className="genre-tree-item">
        <div
          className="flex items-center gap-2 cursor-pointer relative py-1.5 px-2 hover:bg-accent rounded-sm"
          style={{ paddingLeft: `${paddingLeft + 12}px` }}
          onClick={(e) => {
            if (!(e.target as HTMLElement).closest('.expand-button')) {
              handleSelect(genre);
            }
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              handleSelect(genre);
            }
          }}
        >
          <div className="flex items-center gap-2 w-full">
            {hasChildren && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleGenreExpand(genre.id);
                }}
                className="p-1 hover:bg-accent rounded-md expand-button absolute left-0"
                aria-label={isExpanded ? '折叠' : '展开'}
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
            )}
            <div className="flex-1 ml-6">
              <span className="block truncate">{genre.name}</span>
              {genre.description && (
                <span className="text-xs text-muted-foreground truncate block max-w-[200px]">
                  {genre.description}
                </span>
              )}
            </div>
          </div>
        </div>
        
        {hasChildren && isExpanded && (
          <div className="genre-children">
            {genre.children?.map(child => renderGenreTree(child, level + 1, currentPath))}
          </div>
        )}
      </div>
    );
  };

  // 过滤搜索结果
  const filteredGenres = useMemo(() => {
    if (!searchQuery.trim()) return [];
    
    return flattenedGenres.filter(genre =>
      genre.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      genre.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      genre.fullPath?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery, genres, flattenedGenres]);

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={disabled}
        >
          {selectedGenre ? (
            <div className="flex items-center gap-2">
              <span className="truncate">{selectedGenre.fullPath || selectedGenre.name}</span>
              {selectedGenre && (
                <X
                  className="h-4 w-4 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClear();
                  }}
                />
              )}
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0">
        <Command>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Input
              placeholder="搜索类型..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-full border-0 bg-transparent p-0 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0"
            />
            {searchQuery && (
              <X
                className="h-4 w-4 shrink-0 opacity-50 cursor-pointer hover:opacity-100"
                onClick={() => setSearchQuery('')}
              />
            )}
          </div>
          <ScrollArea className="h-[300px]">
            <CommandList>
              {searchQuery ? (
                filteredGenres.length === 0 ? (
                  <CommandEmpty>未找到匹配的类型</CommandEmpty>
                ) : (
                  <CommandGroup>
                    {filteredGenres.map(genre => (
                      <div
                        key={genre.path || genre.id}
                        className="px-2 py-1.5 cursor-pointer hover:bg-accent rounded-sm"
                        onClick={() => handleSelect(genre)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            handleSelect(genre);
                          }
                        }}
                      >
                        <div className="flex flex-col">
                          <span>{genre.fullPath || genre.name}</span>
                          {genre.description && (
                            <span className="text-xs text-muted-foreground">
                              {genre.description}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </CommandGroup>
                )
              ) : (
                <CommandGroup>
                  {genres.map(genre => renderGenreTree(genre))}
                </CommandGroup>
              )}
            </CommandList>
          </ScrollArea>
        </Command>
      </PopoverContent>
    </Popover>
  );
} 