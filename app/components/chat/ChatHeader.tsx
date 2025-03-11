'use client';

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { BrainCircuit, Plus, Settings, MoreHorizontal } from "lucide-react";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { SystemPrompt } from "../../lib/indexedDB";
import ChatSettings from "./ChatSettings";
import ChatMoreActions from "./ChatMoreActions";

interface ChatHeaderProps {
  activePrompt: { id: string; name: string; content: string } | null;
  isAgentMode: boolean;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
  settings: any;
  saveSettings: (settings: any) => void;
  startNewChat: () => void;
  clearChatHistory: () => void;
  exportChatHistory: () => void;
}

const ChatHeader = ({
  activePrompt,
  isAgentMode,
  isSettingsOpen,
  setIsSettingsOpen,
  settings,
  saveSettings,
  startNewChat,
  clearChatHistory,
  exportChatHistory
}: ChatHeaderProps) => {
  return (
    <div className="p-4 border-b flex justify-between items-center">
      <div className="flex items-center">
        <h2 className="text-lg font-semibold">AI聊天助手</h2>
        {activePrompt && (
          <Badge variant="outline" className="ml-2">
            {activePrompt.name}
          </Badge>
        )}
        {isAgentMode && (
          <Badge variant="secondary" className="ml-2">
            <BrainCircuit className="h-3 w-3 mr-1" />
            智能体模式
          </Badge>
        )}
      </div>
      <div className="flex gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={startNewChat}
              >
                <Plus className="h-4 w-4 mr-1" />
                新对话
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>开始新对话</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <ChatSettings 
          isOpen={isSettingsOpen}
          setIsOpen={setIsSettingsOpen}
          settings={settings}
          saveSettings={saveSettings}
        />

        <ChatMoreActions
          exportChatHistory={exportChatHistory}
          clearChatHistory={clearChatHistory}
        />
      </div>
    </div>
  );
};

export default ChatHeader; 