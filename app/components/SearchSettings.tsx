'use client';

import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { SearchProvider, DEFAULT_SEARCH_CONFIG } from '../lib/tools/searchTools';

interface SearchSettingsProps {
  onSettingsChange: (settings: {
    provider: SearchProvider;
    apiKey: string;
    engineId?: string;
  }) => void;
  currentSettings: {
    provider: SearchProvider;
    apiKey: string;
    engineId?: string;
  };
}

export function SearchSettings({ onSettingsChange, currentSettings }: SearchSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [provider, setProvider] = useState<SearchProvider>(currentSettings.provider || DEFAULT_SEARCH_CONFIG.provider);
  const [apiKey, setApiKey] = useState(currentSettings.apiKey || DEFAULT_SEARCH_CONFIG.apiKey);
  const [engineId, setEngineId] = useState(currentSettings.engineId || '');

  const handleSave = () => {
    onSettingsChange({
      provider,
      apiKey,
      ...(provider === 'googlecse' ? { engineId } : {})
    });
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          搜索设置
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>搜索API设置</DialogTitle>
          <DialogDescription>
            配置用于联网搜索的API提供商和密钥
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="provider">搜索提供商</Label>
            <RadioGroup
              id="provider"
              value={provider}
              onValueChange={(value) => setProvider(value as SearchProvider)}
              className="grid grid-cols-1 gap-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="serpapi" id="serpapi" />
                <Label htmlFor="serpapi">SerpAPI (默认)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="googlecse" id="googlecse" disabled />
                <Label htmlFor="googlecse" className="text-muted-foreground">Google Custom Search (即将支持)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="bingapi" id="bingapi" disabled />
                <Label htmlFor="bingapi" className="text-muted-foreground">Bing Search API (即将支持)</Label>
              </div>
            </RadioGroup>
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="apiKey">API密钥</Label>
            <Input
              id="apiKey"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="输入API密钥"
            />
            <p className="text-xs text-muted-foreground">
              {provider === 'serpapi' && 'SerpAPI密钥，可从 https://serpapi.com 获取'}
              {provider === 'googlecse' && 'Google API密钥，可从 Google Cloud Console 获取'}
              {provider === 'bingapi' && 'Bing Search API密钥，可从 Microsoft Azure 获取'}
            </p>
          </div>
          
          {provider === 'googlecse' && (
            <div className="grid gap-2">
              <Label htmlFor="engineId">搜索引擎ID</Label>
              <Input
                id="engineId"
                value={engineId}
                onChange={(e) => setEngineId(e.target.value)}
                placeholder="输入Google自定义搜索引擎ID"
              />
              <p className="text-xs text-muted-foreground">
                Google自定义搜索引擎ID，可从Google Programmable Search Engine获取
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>取消</Button>
          <Button onClick={handleSave}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 