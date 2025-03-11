'use client';

import { useState } from 'react';
import { Button } from '../ui/button';
import { SearchSettings } from '../SearchSettings';
import { SearchTool } from '../SearchTool';
import { SearchProvider, DEFAULT_SEARCH_CONFIG } from '../../lib/tools/searchTools';
import { Globe, Settings2, X } from 'lucide-react';

interface ChatToolbarProps {
  onInsertContent: (content: string) => void;
}

export function ChatToolbar({ onInsertContent }: ChatToolbarProps) {
  const [showSearchTool, setShowSearchTool] = useState(false);
  const [searchSettings, setSearchSettings] = useState({
    provider: DEFAULT_SEARCH_CONFIG.provider,
    apiKey: DEFAULT_SEARCH_CONFIG.apiKey,
    engineId: DEFAULT_SEARCH_CONFIG.engineId
  });

  const handleSearchResult = (result: string) => {
    onInsertContent(result);
  };

  const handleSettingsChange = (newSettings: {
    provider: SearchProvider;
    apiKey: string;
    engineId?: string;
  }) => {
    setSearchSettings(newSettings);
  };

  return (
    <div className="border-t p-2">
      <div className="flex items-center justify-between mb-2">
        <div className="flex space-x-2">
          <Button
            variant={showSearchTool ? "default" : "outline"}
            size="sm"
            onClick={() => setShowSearchTool(!showSearchTool)}
            title="网络搜索"
          >
            <Globe className="h-4 w-4 mr-1" />
            网络搜索
          </Button>
        </div>
        
        <div className="flex space-x-2">
          <SearchSettings
            onSettingsChange={handleSettingsChange}
            currentSettings={searchSettings}
          />
          
          {showSearchTool && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSearchTool(false)}
              title="关闭工具"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      
      {showSearchTool && (
        <div className="mb-4">
          <SearchTool
            onSearchResult={handleSearchResult}
            searchSettings={searchSettings}
          />
        </div>
      )}
    </div>
  );
} 