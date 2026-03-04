import { PenSquare } from "lucide-react";
import LLMSelector from "@/components/common/LLMSelector";

export default function Navbar() {
  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-6">
      <div className="flex items-center gap-2">
        <PenSquare className="h-5 w-5" />
        <span className="text-sm font-semibold">AI 小说写作助手</span>
      </div>
      <LLMSelector />
    </header>
  );
}
