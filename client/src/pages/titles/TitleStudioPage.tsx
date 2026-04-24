import { useMemo, useState } from "react";
import { NOVEL_LIST_PAGE_LIMIT_MAX } from "@ai-novel/shared/types/pagination";
import { useQuery } from "@tanstack/react-query";
import { flattenGenreTreeOptions, getGenreTree } from "@/api/genre";
import { getNovelList } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TitleFactoryPanel from "./components/TitleFactoryPanel";
import TitleLibraryPanel from "./components/TitleLibraryPanel";

export default function TitleStudioPage() {
  const [tab, setTab] = useState("factory");
  const genreTreeQuery = useQuery({
    queryKey: queryKeys.genres.all,
    queryFn: getGenreTree,
  });
  const novelListQuery = useQuery({
    queryKey: queryKeys.novels.list(1, NOVEL_LIST_PAGE_LIMIT_MAX),
    queryFn: () => getNovelList({ page: 1, limit: NOVEL_LIST_PAGE_LIMIT_MAX }),
  });

  const genreTree = genreTreeQuery.data?.data ?? [];
  const genreOptions = useMemo(() => flattenGenreTreeOptions(genreTree), [genreTree]);
  const novels = novelListQuery.data?.data?.items ?? [];

  return (
    <div className="mobile-page-titles mx-auto max-w-6xl space-y-4">
      <Card>
        <CardHeader className="space-y-2">
          <CardTitle>标题工坊</CardTitle>
          <CardDescription>
            把“标题生成”和“标题沉淀”统一成正式资产模块。工坊负责产出候选，标题库负责复用和统计。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={setTab} className="space-y-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="factory">标题工坊</TabsTrigger>
              <TabsTrigger value="library">标题库</TabsTrigger>
            </TabsList>

            <TabsContent value="factory">
              <TitleFactoryPanel genreTree={genreTree} novels={novels} />
            </TabsContent>

            <TabsContent value="library">
              <TitleLibraryPanel genreOptions={genreOptions} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
