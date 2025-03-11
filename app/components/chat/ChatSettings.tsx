'use client';

import { Button } from "../ui/button";
import { Settings, Save } from "lucide-react";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "../ui/dialog";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Slider } from "../ui/slider";
import { Switch } from "../ui/switch";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "../ui/select";
import { ChatSettings as ChatSettingsType } from "../../lib/indexedDB";
import { useState } from "react";

interface ChatSettingsProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  settings: ChatSettingsType;
  saveSettings: (settings: ChatSettingsType) => void;
}

const ChatSettings = ({ 
  isOpen, 
  setIsOpen, 
  settings,
  saveSettings 
}: ChatSettingsProps) => {
  const [localSettings, setLocalSettings] = useState<ChatSettingsType>(settings);
  const [isAgentMode, setIsAgentMode] = useState(false);

  // 打开对话框时更新本地设置
  const onOpenChange = (open: boolean) => {
    if (open) {
      setLocalSettings(settings);
    }
    setIsOpen(open);
  };

  // 保存设置
  const handleSaveSettings = () => {
    saveSettings(localSettings);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="h-4 w-4 mr-1" />
          设置
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>聊天设置</DialogTitle>
          <DialogDescription>
            调整AI模型和对话历史设置
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="contextWindow" className="col-span-4">
              历史上下文轮数: {localSettings.contextWindowSize}
            </Label>
            <div className="col-span-4">
              <Slider
                id="contextWindow"
                defaultValue={[localSettings.contextWindowSize]}
                max={20}
                min={1}
                step={1}
                onValueChange={(value: number[]) => {
                  setLocalSettings({
                    ...localSettings,
                    contextWindowSize: value[0],
                  });
                }}
                className="mb-2"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>较少记忆 (1轮)</span>
                <span>较多记忆 (20轮)</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="temperature" className="col-span-4">
              温度值: {localSettings.temperature.toFixed(1)}
            </Label>
            <div className="col-span-4">
              <Slider
                id="temperature"
                defaultValue={[localSettings.temperature]}
                max={1}
                min={0}
                step={0.1}
                onValueChange={(value: number[]) => {
                  setLocalSettings({
                    ...localSettings,
                    temperature: value[0],
                  });
                }}
                className="mb-2"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>精确 (0.0)</span>
                <span>创意 (1.0)</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="model" className="col-span-4">
              AI模型
            </Label>
            <Select
              value={localSettings.model}
              onValueChange={(value) => {
                setLocalSettings({
                  ...localSettings, 
                  model: value
                });
              }}
            >
              <SelectTrigger className="col-span-4">
                <SelectValue placeholder="选择模型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="deepseek-chat">Deepseek Chat</SelectItem>
                <SelectItem value="deepseek-coder">Deepseek Coder</SelectItem>
                <SelectItem value="deepseek-reasoner">Deepseek Reasoner</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="maxTokens" className="col-span-4">
              最大Token数 (可选)
            </Label>
            <Input
              id="maxTokens"
              type="number"
              placeholder="不限制"
              className="col-span-4"
              value={localSettings.maxTokens || ''}
              onChange={(e) => {
                const value = e.target.value === '' ? undefined : parseInt(e.target.value);
                setLocalSettings({
                  ...localSettings,
                  maxTokens: value
                });
              }}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="agentMode" className="col-span-4">
              智能体模式
            </Label>
            <div className="flex items-center space-x-2 col-span-4">
              <Switch
                id="agentMode"
                checked={isAgentMode}
                onCheckedChange={setIsAgentMode}
              />
              <Label htmlFor="agentMode">
                {isAgentMode ? "已启用" : "已禁用"}
              </Label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button 
            type="submit" 
            onClick={handleSaveSettings}
          >
            <Save className="h-4 w-4 mr-1" />
            保存设置
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ChatSettings; 