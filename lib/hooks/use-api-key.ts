'use client';

import { useState, useEffect } from 'react';

export function useApiKey() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadApiKey = async () => {
      try {
        // 从本地存储加载API密钥
        const storedKey = localStorage.getItem('deepseek_api_key');
        setApiKey(storedKey);
      } catch (error) {
        console.error('Failed to load API key:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadApiKey();
  }, []);

  const updateApiKey = (newKey: string) => {
    try {
      localStorage.setItem('deepseek_api_key', newKey);
      setApiKey(newKey);
    } catch (error) {
      console.error('Failed to save API key:', error);
    }
  };

  const clearApiKey = () => {
    try {
      localStorage.removeItem('deepseek_api_key');
      setApiKey(null);
    } catch (error) {
      console.error('Failed to clear API key:', error);
    }
  };

  return {
    apiKey,
    isLoading,
    updateApiKey,
    clearApiKey
  };
} 