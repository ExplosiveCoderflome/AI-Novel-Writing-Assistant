'use client';

import { useState, useEffect } from 'react';
import { ChatSettings, DEFAULT_SETTINGS, chatHistoryDB, SystemPrompt } from '../lib/indexedDB';

export const useChatSettings = () => {
  const [settings, setSettings] = useState<ChatSettings>(DEFAULT_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAgentMode, setIsAgentMode] = useState(false);
  const [activePrompt, setActivePrompt] = useState<SystemPrompt | null>(null);
  const [isSettingActivePrompt, setIsSettingActivePrompt] = useState(false);

  // 从 IndexedDB 加载设置
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const savedSettings = await chatHistoryDB.getSettings();
        setSettings(savedSettings);
        
        // 加载活跃的系统提示词
        try {
          const prompt = await chatHistoryDB.getActiveSystemPrompt();
          if (prompt) {
            console.log("已加载活跃系统提示词:", prompt);
            setActivePrompt(prompt);
            
            // 如果提示词是智能体类型，自动启用智能体模式
            if (prompt.type === 'agent') {
              setIsAgentMode(true);
            }
          }
        } catch (promptError) {
          console.error("加载活跃系统提示词失败:", promptError);
        }
      } catch (error) {
        console.error("加载设置失败:", error);
        // 使用默认设置
        setSettings(DEFAULT_SETTINGS);
      }
    };

    loadSettings();
  }, []);

  // 保存设置
  const saveSettings = async (newSettings: ChatSettings) => {
    try {
      await chatHistoryDB.saveSettings(newSettings);
      setSettings(newSettings);
      setIsSettingsOpen(false);
    } catch (error) {
      console.error("保存设置失败:", error);
    }
  };

  // 处理提示词选择
  const handlePromptSelect = async (prompt: SystemPrompt) => {
    // 避免重复设置相同的提示词
    if (activePrompt?.id === prompt.id || isSettingActivePrompt) {
      return;
    }
    
    console.log("选择提示词:", prompt);
    setIsSettingActivePrompt(true);
    setActivePrompt(prompt);
    
    // 保存活跃提示词
    try {
      await chatHistoryDB.setActiveSystemPrompt(prompt.id);
      
      // 如果提示词是智能体类型，自动启用智能体模式
      if (prompt.type === 'agent' && !isAgentMode) {
        setIsAgentMode(true);
      }
    } catch (error) {
      console.error("设置活跃系统提示词失败:", error);
    } finally {
      setIsSettingActivePrompt(false);
    }
  };

  return {
    settings,
    setSettings,
    isSettingsOpen,
    setIsSettingsOpen,
    isAgentMode,
    setIsAgentMode,
    activePrompt,
    setActivePrompt,
    saveSettings,
    handlePromptSelect
  };
};

export default useChatSettings; 