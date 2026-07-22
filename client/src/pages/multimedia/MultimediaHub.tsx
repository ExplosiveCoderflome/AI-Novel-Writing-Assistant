import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MonitorPlay, SquareStack, Video } from "lucide-react";

const ComicWorkspacePage = lazy(() => import("@/pages/comic/ComicWorkspacePage"));
const DramaWorkspacePage = lazy(() => import("@/pages/drama/DramaWorkspacePage"));
const VideoWorkspacePage = lazy(() => import("@/pages/video/VideoWorkspacePage"));

export default function MultimediaHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "comic";

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value });
  };

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 pt-6 pb-2">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="comic" className="flex items-center gap-2">
              <SquareStack className="h-4 w-4" />
              <span>漫画工坊</span>
            </TabsTrigger>
            <TabsTrigger value="drama" className="flex items-center gap-2">
              <MonitorPlay className="h-4 w-4" />
              <span>短剧工坊</span>
            </TabsTrigger>
            <TabsTrigger value="video" className="flex items-center gap-2">
              <Video className="h-4 w-4" />
              <span>视频工坊</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      
      <Suspense fallback={<div className="py-12 text-center text-sm text-muted-foreground">加载中...</div>}>
        {activeTab === "comic" && <ComicWorkspacePage />}
        {activeTab === "drama" && <DramaWorkspacePage />}
        {activeTab === "video" && <VideoWorkspacePage />}
      </Suspense>
    </div>
  );
}
