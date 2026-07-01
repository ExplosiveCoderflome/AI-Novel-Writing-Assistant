import { PlusCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DIRECTOR_CREATE_LINK, MANUAL_CREATE_LINK } from "../homeViewModel";

export function HomeStarterPanel() {
  return (
    <Card className="home-dashboard-secondary">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg tracking-normal">开始新项目</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-6 text-muted-foreground">
          有新灵感时，优先交给自动导演整理方向、角色、世界观和章节准备；手动创建适合资料已经明确的项目。
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
          <Button asChild>
            <Link to={DIRECTOR_CREATE_LINK}>
              <PlusCircle className="mr-2 h-4 w-4" aria-hidden="true" />
              AI 自动导演开书
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to={MANUAL_CREATE_LINK}>手动创建小说</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
