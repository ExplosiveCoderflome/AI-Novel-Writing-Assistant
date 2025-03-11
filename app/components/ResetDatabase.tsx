'use client';

import { Button } from './ui/button';
import { useState } from 'react';
import { DB_NAME } from '../lib/indexedDB';

export default function ResetDatabase() {
  const [isResetting, setIsResetting] = useState(false);
  
  const resetDatabase = async () => {
    if (!confirm('确定要重置数据库吗？这将删除所有聊天记录和设置。')) {
      return;
    }
    
    setIsResetting(true);
    
    try {
      // 删除数据库
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(DB_NAME);
        
        request.onsuccess = () => {
          console.log('数据库已成功删除');
          resolve();
        };
        
        request.onerror = () => {
          console.error('无法删除数据库', request.error);
          reject(new Error('删除数据库失败'));
        };
      });
      
      // 刷新页面以重新初始化数据库
      window.location.reload();
    } catch (error) {
      console.error('重置数据库失败:', error);
      alert('重置数据库失败，请查看控制台获取详细信息。');
    } finally {
      setIsResetting(false);
    }
  };
  
  return (
    <Button 
      onClick={resetDatabase} 
      disabled={isResetting}
      variant="destructive"
      size="sm"
      className="mt-4"
    >
      {isResetting ? '重置中...' : '重置数据库'}
    </Button>
  );
} 