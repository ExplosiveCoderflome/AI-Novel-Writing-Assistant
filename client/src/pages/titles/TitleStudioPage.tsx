import { useMemo, useState } from "react";
import { NOVEL_LIST_PAGE_LIMIT_MAX } from "@ai-novel/shared/types/pagination";
import { useQuery } from "@tanstack/react-query";
import { flattenGenreTreeOptions, getGenreTree } from "@/api/genre";
import { getNovelList } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
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
    <div className="mx-auto w-full max-w-5xl space-y-5 px-1 sm:px-2">
      <section className="rounded-lg border bg-card px-5 py-4">
        <h1 className="text-2xl font-semibold tracking-normal">标题工坊</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          把“标题生成”和“标题沉淀”统一成正式资产模块。工坊负责产出候选，标题库负责复用和统计。
        </p>
      </section>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <div className="flex">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="factory">标题工坊</TabsTrigger>
            <TabsTrigger value="library">标题库</TabsTrigger>
          </TabsList>
        </div>

        <section className="rounded-lg border bg-card p-4 sm:p-5">
          <TabsContent value="factory" className="mt-0">
            <TitleFactoryPanel genreTree={genreTree} novels={novels} />
          </TabsContent>

          <TabsContent value="library" className="mt-0">
            <TitleLibraryPanel genreOptions={genreOptions} />
          </TabsContent>
        </section>
      </Tabs>
    </div>
  );
}
