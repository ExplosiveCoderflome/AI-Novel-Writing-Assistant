"use client";

import { useState, useEffect } from "react";
import { SystemPrompt, chatHistoryDB } from "../../lib/indexedDB";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Textarea } from "../ui/textarea";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import { PlusCircle, Edit, Trash2, Save, Bot, Brain, Sparkles } from "lucide-react";
import { Switch } from "../ui/switch";
import { FormItem, FormLabel, FormDescription } from "../ui/form";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../ui/select";

interface SystemPromptManagerProps {
  onPromptSelect: (prompt: SystemPrompt) => void;
  activePromptId?: string;
}

export function SystemPromptManager({ onPromptSelect, activePromptId }: SystemPromptManagerProps) {
  const [prompts, setPrompts] = useState<SystemPrompt[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState<SystemPrompt | null>(null);
  const [newPrompt, setNewPrompt] = useState<Partial<SystemPrompt>>({
    name: "",
    content: "",
    type: "assistant"
  });
  const [activeTab, setActiveTab] = useState<string>("all");
  const [searchProvider, setSearchProvider] = useState<SearchProvider>('serpapi');

  // 鍔犺浇鎵€鏈夌郴缁熸彁绀鸿瘝
  useEffect(() => {
    const loadPrompts = async () => {
      try {
        console.log("寮€濮嬪姞杞界郴缁熸彁绀鸿瘝鍒楄〃...");
        const allPrompts = await chatHistoryDB.getAllSystemPrompts();
        console.log("鎴愬姛鍔犺浇绯荤粺鎻愮ず璇嶅垪琛?", allPrompts);
        setPrompts(allPrompts);
      } catch (error) {
        console.error("鍔犺浇绯荤粺鎻愮ず璇嶅け璐?", error);
      }
    };

    loadPrompts();
  }, []);

  // 鏍规嵁绫诲瀷杩囨护鎻愮ず璇?
  const filteredPrompts = activeTab === "all" 
    ? prompts 
    : prompts.filter(prompt => prompt.type === activeTab);

  // 娣诲姞鏂版彁绀鸿瘝
  const handleAddPrompt = async () => {
    try {
      if (!newPrompt.name || !newPrompt.content) return;

      const prompt: SystemPrompt = {
        id: `prompt-${Date.now()}`,
        name: newPrompt.name,
        content: newPrompt.content,
        type: newPrompt.type as 'assistant' | 'agent',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await chatHistoryDB.saveSystemPrompt(prompt);
      
      // 鏇存柊鏈湴鐘舵€?
      setPrompts(prev => [...prev, prompt]);
      
      // 閲嶇疆琛ㄥ崟
      setNewPrompt({
        name: "",
        content: "",
        type: "assistant"
      });
      
      // 鍏抽棴瀵硅瘽妗?
      setIsAddDialogOpen(false);
    } catch (error) {
      console.error("娣诲姞绯荤粺鎻愮ず璇嶅け璐?", error);
    }
  };

  // 鏇存柊鎻愮ず璇?
  const handleUpdatePrompt = async () => {
    try {
      if (!currentPrompt) return;

      await chatHistoryDB.saveSystemPrompt(currentPrompt);
      
      // 鏇存柊鏈湴鐘舵€?
      setPrompts(prev => 
        prev.map(p => p.id === currentPrompt.id ? currentPrompt : p)
      );
      
      // 鍏抽棴瀵硅瘽妗?
      setIsEditDialogOpen(false);
    } catch (error) {
      console.error("鏇存柊绯荤粺鎻愮ず璇嶅け璐?", error);
    }
  };

  // 鍒犻櫎鎻愮ず璇?
  const handleDeletePrompt = async () => {
    try {
      if (!currentPrompt) return;

      await chatHistoryDB.deleteSystemPrompt(currentPrompt.id);
      
      // 鏇存柊鏈湴鐘舵€?
      setPrompts(prev => prev.filter(p => p.id !== currentPrompt.id));
      
      // 鍏抽棴瀵硅瘽妗?
      setIsDeleteDialogOpen(false);
    } catch (error) {
      console.error("鍒犻櫎绯荤粺鎻愮ず璇嶅け璐?", error);
    }
  };

  // 閫夋嫨鎻愮ず璇?
  const handleSelectPrompt = async (prompt: SystemPrompt) => {
    // 濡傛灉宸茬粡鏄椿璺冪殑鎻愮ず璇嶏紝鍒欎笉闇€瑕佸啀娆¤缃?
    if (prompt.id === activePromptId) {
      return;
    }
    
    try {
      await chatHistoryDB.setActiveSystemPrompt(prompt.id);
      onPromptSelect(prompt);
    } catch (error) {
      console.error("璁剧疆娲昏穬绯荤粺鎻愮ず璇嶅け璐?", error);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">绯荤粺鎻愮ず璇?/h2>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <PlusCircle className="h-4 w-4 mr-1" />
              鏂板缓鎻愮ず璇?
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>鍒涘缓鏂扮殑绯荤粺鎻愮ず璇?/DialogTitle>
              <DialogDescription>
                绯荤粺鎻愮ず璇嶅喅瀹氫簡AI鍔╂墜鐨勮涓哄拰涓撲笟棰嗗煙銆?
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="promptName" className="text-right">
                  鍚嶇О
                </Label>
                <Input
                  id="promptName"
                  value={newPrompt.name}
                  onChange={(e) => setNewPrompt({ ...newPrompt, name: e.target.value })}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="promptType" className="text-right">
                  绫诲瀷
                </Label>
                <div className="flex items-center space-x-2 col-span-3">
                  <Switch
                    id="promptType"
                    checked={newPrompt.type === "agent"}
                    onCheckedChange={(checked) => 
                      setNewPrompt({ ...newPrompt, type: checked ? "agent" : "assistant" })
                    }
                  />
                  <Label htmlFor="promptType">
                    {newPrompt.type === "agent" ? "鏅鸿兘浣撴ā寮? : "鏅€氬姪鎵嬫ā寮?}
                  </Label>
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="promptContent" className="text-right">
                  鍐呭
                </Label>
                <Textarea
                  id="promptContent"
                  value={newPrompt.content}
                  onChange={(e) => setNewPrompt({ ...newPrompt, content: e.target.value })}
                  className="col-span-3"
                  rows={10}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" onClick={handleAddPrompt}>淇濆瓨</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="all">鍏ㄩ儴</TabsTrigger>
          <TabsTrigger value="assistant">鍔╂墜</TabsTrigger>
          <TabsTrigger value="agent">鏅鸿兘浣?/TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="mt-2">
          <ScrollArea className="h-[calc(100vh-440px)]">
            <div className="space-y-2">
              {filteredPrompts.map((prompt) => (
                <PromptCard
                  key={prompt.id}
                  prompt={prompt}
                  isActive={prompt.id === activePromptId}
                  onSelect={() => handleSelectPrompt(prompt)}
                  onEdit={() => {
                    setCurrentPrompt(prompt);
                    setIsEditDialogOpen(true);
                  }}
                  onDelete={() => {
                    setCurrentPrompt(prompt);
                    setIsDeleteDialogOpen(true);
                  }}
                />
              ))}
              {filteredPrompts.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  娌℃湁鎵惧埌绯荤粺鎻愮ず璇?
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
        <TabsContent value="assistant" className="mt-2">
          <ScrollArea className="h-[calc(100vh-300px)]">
            <div className="space-y-2">
              {filteredPrompts.map((prompt) => (
                <PromptCard
                  key={prompt.id}
                  prompt={prompt}
                  isActive={prompt.id === activePromptId}
                  onSelect={() => handleSelectPrompt(prompt)}
                  onEdit={() => {
                    setCurrentPrompt(prompt);
                    setIsEditDialogOpen(true);
                  }}
                  onDelete={() => {
                    setCurrentPrompt(prompt);
                    setIsDeleteDialogOpen(true);
                  }}
                />
              ))}
              {filteredPrompts.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  娌℃湁鎵惧埌鍔╂墜绫诲瀷鐨勭郴缁熸彁绀鸿瘝
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
        <TabsContent value="agent" className="mt-2">
          <ScrollArea className="h-[calc(100vh-300px)]">
            <div className="space-y-2">
              {filteredPrompts.map((prompt) => (
                <PromptCard
                  key={prompt.id}
                  prompt={prompt}
                  isActive={prompt.id === activePromptId}
                  onSelect={() => handleSelectPrompt(prompt)}
                  onEdit={() => {
                    setCurrentPrompt(prompt);
                    setIsEditDialogOpen(true);
                  }}
                  onDelete={() => {
                    setCurrentPrompt(prompt);
                    setIsDeleteDialogOpen(true);
                  }}
                />
              ))}
              {filteredPrompts.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  娌℃湁鎵惧埌鏅鸿兘浣撶被鍨嬬殑绯荤粺鎻愮ず璇?
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* 缂栬緫瀵硅瘽妗?*/}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>缂栬緫绯荤粺鎻愮ず璇?/DialogTitle>
            <DialogDescription>
              淇敼绯荤粺鎻愮ず璇嶇殑鍐呭鍜岃缃€?
            </DialogDescription>
          </DialogHeader>
          {currentPrompt && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="editPromptName" className="text-right">
                  鍚嶇О
                </Label>
                <Input
                  id="editPromptName"
                  value={currentPrompt.name}
                  onChange={(e) => setCurrentPrompt({ ...currentPrompt, name: e.target.value })}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="editPromptType" className="text-right">
                  绫诲瀷
                </Label>
                <div className="flex items-center space-x-2 col-span-3">
                  <Switch
                    id="editPromptType"
                    checked={currentPrompt.type === "agent"}
                    onCheckedChange={(checked) => 
                      setCurrentPrompt({ 
                        ...currentPrompt, 
                        type: checked ? "agent" : "assistant",
                        updatedAt: new Date()
                      })
                    }
                  />
                  <Label htmlFor="editPromptType">
                    {currentPrompt.type === "agent" ? "鏅鸿兘浣撴ā寮? : "鏅€氬姪鎵嬫ā寮?}
                  </Label>
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="editPromptContent" className="text-right">
                  鍐呭
                </Label>
                <Textarea
                  id="editPromptContent"
                  value={currentPrompt.content}
                  onChange={(e) => setCurrentPrompt({ ...currentPrompt, content: e.target.value })}
                  className="col-span-3"
                  rows={10}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="submit" onClick={handleUpdatePrompt}>鏇存柊</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 鍒犻櫎纭瀵硅瘽妗?*/}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>纭鍒犻櫎</DialogTitle>
            <DialogDescription>
              鎮ㄧ‘瀹氳鍒犻櫎杩欎釜绯荤粺鎻愮ず璇嶅悧锛熸鎿嶄綔鏃犳硶鎾ら攢銆?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              鍙栨秷
            </Button>
            <Button variant="destructive" onClick={handleDeletePrompt}>
              鍒犻櫎
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FormItem>
        <FormLabel>鎼滅储鎻愪緵鍟?/FormLabel>
        <Select
          value={searchProvider}
          onValueChange={(value: SearchProvider) => setSearchProvider(value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="閫夋嫨鎼滅储鎻愪緵鍟? />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="serpapi">SerpAPI (榛樿)</SelectItem>
            <SelectItem value="exa">Exa鎼滅储 (瀹炴椂缃戠粶鏁版嵁)</SelectItem>
          </SelectContent>
        </Select>
        <FormDescription>
          閫夋嫨涓嶅悓鐨勬悳绱㈡彁渚涘晢浠ヨ幏鍙栦笉鍚岀被鍨嬬殑淇℃伅
        </FormDescription>
      </FormItem>
    </div>
  );
}

// 鎻愮ず璇嶅崱鐗囩粍浠?
interface PromptCardProps {
  prompt: SystemPrompt;
  isActive: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function PromptCard({ prompt, isActive, onSelect, onEdit, onDelete }: PromptCardProps) {
  return (
    <Card className={`${isActive ? 'border-primary' : ''}`}>
      <CardHeader className="p-4 pb-2">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-base flex items-center">
              {prompt.type === 'agent' ? (
                <Brain className="h-4 w-4 mr-1 text-blue-500" />
              ) : (
                <Bot className="h-4 w-4 mr-1 text-green-500" />
              )}
              {prompt.name}
            </CardTitle>
            <CardDescription className="text-xs">
              {new Date(prompt.updatedAt).toLocaleString()}
            </CardDescription>
          </div>
          <Badge variant={prompt.type === 'agent' ? 'secondary' : 'outline'}>
            {prompt.type === 'agent' ? '鏅鸿兘浣? : '鍔╂墜'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <p className="text-sm line-clamp-2 text-muted-foreground">
          {prompt.content.substring(0, 100)}...
        </p>
      </CardContent>
      <CardFooter className="p-2 flex justify-between">
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Edit className="h-3 w-3 mr-1" />
            缂栬緫
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete}>
            <Trash2 className="h-3 w-3 mr-1" />
            鍒犻櫎
          </Button>
        </div>
        <Button 
          variant={isActive ? "default" : "outline"} 
          size="sm" 
          onClick={onSelect}
          className={isActive ? "bg-primary text-primary-foreground" : ""}
        >
          {isActive ? (
            <>
              <Sparkles className="h-3 w-3 mr-1" />
              褰撳墠浣跨敤
            </>
          ) : "浣跨敤"}
        </Button>
      </CardFooter>
    </Card>
  );
}

export function createSearchTool(config: SearchAPIConfig = DEFAULT_SEARCH_CONFIG): Tool {
  switch (config.provider) {
    case 'serpapi':
      return new SerpAPI(config.apiKey, {
        location: 'China',
        hl: 'zh-cn',
        gl: 'cn'
      });
    
    case 'exa':
      return new ExaSearchTool(config.apiKey, config.numberOfResults || 5);
    
    // 鍙互鍦ㄨ繖閲屾坊鍔犳洿澶氭悳绱PI鎻愪緵鍟嗙殑鏀寔
    
    default:
      return new SerpAPI(config.apiKey, {
        location: 'China',
        hl: 'zh-cn',
        gl: 'cn'
      });
  }
}

// 鎼滅储API鎻愪緵鍟嗙被鍨?
export type SearchProvider = 'serpapi' | 'googlecse' | 'bingapi' | 'exa';

// 鎼滅储API閰嶇疆鎺ュ彛
export interface SearchAPIConfig {
  provider: SearchProvider;
  apiKey: string;
  engineId?: string; // 鐢ㄤ簬Google Custom Search
  numberOfResults?: number; // 鐢ㄤ簬鎺у埗杩斿洖缁撴灉鏁伴噺
}

// 榛樿閰嶇疆
export const DEFAULT_SEARCH_CONFIG: SearchAPIConfig = {
  provider: 'serpapi',
  apiKey: 'cca76c786d6a6db3634fcef70d6ea5c1e7ec3b185fe3caf44b4753950f71f134'
};

// Exa閰嶇疆
export const EXA_SEARCH_CONFIG: SearchAPIConfig = {
  provider: 'exa',
  apiKey: 'c4e14679-23cd-45df-aa49-4bc6f9a79520',
  numberOfResults: 5
};

// 瀹氫箟Exa鎼滅储缁撴灉鎺ュ彛
interface ExaSearchResult {
  url: string;
  title: string;
  snippet: string;
}

// Exa鎼滅储宸ュ叿绫?
export class ExaSearchTool extends Tool {
  name = "exa_search";
  description = "浣跨敤Exa鎼滅储寮曟搸鏌ユ壘鏈€鏂扮殑缃戠粶淇℃伅";
  apiKey: string;
  numberOfResults: number;

  constructor(apiKey: string, numberOfResults: number = 5) {
    super();
    this.apiKey = apiKey;
    this.numberOfResults = numberOfResults;
  }

  async _call(query: string): Promise<string> {
    try {
      const response = await fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey
        },
        body: JSON.stringify({
          query,
          numResults: this.numberOfResults,
          useAutoprompt: true // 鍚敤鏅鸿兘鏌ヨ澧炲己
        })
      });

      if (!response.ok) {
        throw new Error(`Exa API璇锋眰澶辫触: ${response.status}`);
      }

      const data = await response.json();
      
      // 鏍煎紡鍖栨悳绱㈢粨鏋?
      let formattedResults = '鎼滅储缁撴灉:\n\n';
      
      if (data.results && data.results.length > 0) {
        data.results.forEach((result: ExaSearchResult, index: number) => {
          formattedResults += `${index + 1}. ${result.title}\n`;
          formattedResults += `   閾炬帴: ${result.url}\n`;
          formattedResults += `   鎽樿: ${result.snippet}\n\n`;
        });
      } else {
        formattedResults += '鏈壘鍒扮浉鍏崇粨鏋溿€?;
      }

      return formattedResults;
    } catch (error) {
      return `鎼滅储鍑洪敊: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

// 鑾峰彇鎼滅储閰嶇疆
export function getSearchConfig(provider?: SearchProvider): SearchAPIConfig {
  switch (provider) {
    case 'exa':
      return EXA_SEARCH_CONFIG;
    case 'serpapi':
      return DEFAULT_SEARCH_CONFIG;
    default:
      return DEFAULT_SEARCH_CONFIG;
  }
}

// 淇敼processMessageWithWebSearch鍑芥暟
export async function processMessageWithWebSearch(
  userMessage: string,
  chatHistory: Array<{ role: string; content: string }>,
  openAIApiKey: string,
  provider: SearchProvider = 'serpapi'
) {
  try {
    const searchConfig = getSearchConfig(provider);
    const conversation = getWebSearchConversation(openAIApiKey, searchConfig);
    return await conversation.processMessage(userMessage, chatHistory);
  } catch (error) {
    console.error('澶勭悊娑堟伅鍑洪敊:', error);
    throw error;
  }
} 
