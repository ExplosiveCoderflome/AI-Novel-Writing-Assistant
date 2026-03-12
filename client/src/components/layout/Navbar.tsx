import { PenSquare } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import LLMSelector from "@/components/common/LLMSelector";
import { Button } from "@/components/ui/button";

export default function Navbar() {
  const location = useLocation();
  const isHome = location.pathname === "/";

  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-6">
      <div className="flex items-center gap-2">
        <PenSquare className="h-5 w-5" />
        <span className="text-sm font-semibold">AI 小说写作助手</span>
      </div>
      {isHome ? (
        <Button asChild size="sm" variant="outline">
          <Link to="/settings/model-routes">模型设置</Link>
        </Button>
      ) : (
        <LLMSelector />
      )}
    </header>
  );
}
