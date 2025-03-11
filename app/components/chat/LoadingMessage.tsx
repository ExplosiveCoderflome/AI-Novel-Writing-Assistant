'use client';

import { Avatar, AvatarFallback } from "../ui/avatar";
import { Button } from "../ui/button";
import { XCircle } from "lucide-react";

interface LoadingMessageProps {
  onCancel?: () => void;
}

const LoadingMessage = ({ onCancel }: LoadingMessageProps) => {
  return (
    <div className="flex justify-start animate-fade-in">
      <div className="flex items-start gap-3">
        <Avatar className="w-8 h-8 shrink-0">
          <AvatarFallback className="bg-muted text-foreground">A</AvatarFallback>
        </Avatar>
        <div className="rounded-lg p-3 bg-muted shadow-sm flex justify-between items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:-0.3s] opacity-70" />
            <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:-0.15s] opacity-70" />
            <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce opacity-70" />
          </div>
          {onCancel && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onCancel}
              className="text-xs h-6 px-2"
            >
              <XCircle className="h-3 w-3 mr-1" />
              停止生成
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoadingMessage; 