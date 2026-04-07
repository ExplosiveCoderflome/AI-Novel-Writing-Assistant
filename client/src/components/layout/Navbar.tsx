import { useState } from "react";
import { PenSquare } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import LLMSelector from "@/components/common/LLMSelector";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface NavbarProps {
  workspaceNavMode?: "workspace" | "project";
  onWorkspaceNavModeChange?: (mode: "workspace" | "project") => void;
}

export default function Navbar(props: NavbarProps) {
  const { workspaceNavMode, onWorkspaceNavModeChange } = props;
  const location = useLocation();
  const [isModelDialogOpen, setIsModelDialogOpen] = useState(false);
  const isHome = location.pathname === "/";
  const showWorkspaceToggle = Boolean(workspaceNavMode && onWorkspaceNavModeChange);

  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-6">
      <div className="flex items-center gap-2">
        <PenSquare className="h-5 w-5" />
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold">AI 小说创作工作台</span>
          <span className="text-[11px] text-muted-foreground">AI Novel Production Engine</span>
        </div>
      </div>
      {isHome ? (
        <Button asChild size="sm" variant="outline">
          <Link to="/settings/model-routes">模型设置</Link>
        </Button>
      ) : (
        <div className="flex items-center gap-3">
          {showWorkspaceToggle ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onWorkspaceNavModeChange?.(workspaceNavMode === "workspace" ? "project" : "workspace")}
            >
              {workspaceNavMode === "workspace" ? "项目导航" : "创作导航"}
            </Button>
          ) : null}
          {showWorkspaceToggle ? (
            <Dialog open={isModelDialogOpen} onOpenChange={setIsModelDialogOpen}>
              <DialogTrigger asChild>
                <Button type="button" size="sm" variant="outline">
                  模型设置
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>模型设置</DialogTitle>
                </DialogHeader>
                <LLMSelector />
              </DialogContent>
            </Dialog>
          ) : (
            <LLMSelector />
          )}
        </div>
      )}
    </header>
  );
}
