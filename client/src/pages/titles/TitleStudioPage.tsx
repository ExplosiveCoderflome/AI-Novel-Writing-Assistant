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
    <Tabs value={tab} onValueChange={setTab} className="mx-auto w-full max-w-6xl space-y-7 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Title Studio
          </div>
          <h1 className="text-3xl font-semibold tracking-normal text-foreground">标题工坊</h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            用项目资料、作品简报或参考标题生成候选；看中的标题可以复制，也可以沉淀到标题库里反复使用。
          </p>
        </div>

        <TabsList className="grid h-10 w-full grid-cols-2 bg-muted/35 p-1 md:w-[320px]">
          <TabsTrigger value="factory">生成候选</TabsTrigger>
          <TabsTrigger value="library">标题库</TabsTrigger>
        </TabsList>
      </header>

      <TabsContent value="factory" className="mt-0">
        <TitleFactoryPanel genreTree={genreTree} novels={novels} />
      </TabsContent>

      <TabsContent value="library" className="mt-0">
        <TitleLibraryPanel genreOptions={genreOptions} />
      </TabsContent>
    </Tabs>
  );
}
