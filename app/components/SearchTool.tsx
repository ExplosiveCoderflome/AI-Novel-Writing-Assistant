'use client';

import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { SearchIcon, Loader2 } from 'lucide-react';
import { searchWeb, formatSearchResult } from '../lib/services/searchService';
import { SearchProvider, DEFAULT_SEARCH_CONFIG } from '../lib/tools/searchTools';
import { MarkdownRenderer } from './ui/markdown-renderer';

interface SearchToolProps {
  onSearchResult: (result: string) => void;
  searchSettings: {
    provider: SearchProvider;
    apiKey: string;
    engineId?: string;
  };
}

export function SearchTool({ onSearchResult, searchSettings }: SearchToolProps) {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    
    setIsSearching(true);
    setError(null);
    
    try {
      const result = await searchWeb(query, searchSettings);
      
      if (result.startsWith('搜索失败')) {
        setError(result);
        setSearchResult(null);
      } else {
        const formattedResult = formatSearchResult(query, result);
        setSearchResult(formattedResult);
        onSearchResult(formattedResult);
      }
    } catch (err) {
      setError(`搜索出错: ${err instanceof Error ? err.message : String(err)}`);
      setSearchResult(null);
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>网络搜索</CardTitle>
        <CardDescription>
          搜索网络获取最新信息
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex space-x-2">
          <Input
            placeholder="输入搜索内容..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSearching}
          />
          <Button 
            onClick={handleSearch} 
            disabled={isSearching || !query.trim()}
          >
            {isSearching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SearchIcon className="h-4 w-4" />
            )}
          </Button>
        </div>
        
        {error && (
          <div className="mt-4 p-3 bg-red-50 text-red-600 rounded-md text-sm">
            {error}
          </div>
        )}
        
        {searchResult && (
          <div className="mt-4 border rounded-md p-4 max-h-[300px] overflow-y-auto">
            <MarkdownRenderer content={searchResult} />
          </div>
        )}
      </CardContent>
      <CardFooter className="text-xs text-muted-foreground">
        搜索提供商: {searchSettings.provider || DEFAULT_SEARCH_CONFIG.provider}
      </CardFooter>
    </Card>
  );
} 