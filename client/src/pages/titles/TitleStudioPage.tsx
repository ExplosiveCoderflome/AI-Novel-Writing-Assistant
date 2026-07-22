import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
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
    <Tabs value={tab} onValueChange={setTab} className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-normal text-foreground">{t("gen.pages.titles.TitleStudioPage.gen_ca04046b")}</h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              用项目资料、作品简报或参考标题生成候选；看中的标题可以复制，也可以沉淀到标题库里反复使用。
            </p>
          </div>

          <TabsList className="grid h-10 w-full grid-cols-2 bg-muted/35 p-1 md:w-[300px]">
            <TabsTrigger value="factory">{t("gen.pages.titles.TitleStudioPage.gen_2289de6c")}</TabsTrigger>
            <TabsTrigger value="library">{t("gen.pages.titles.TitleStudioPage.gen_49fedc67")}</TabsTrigger>
          </TabsList>
        </div>
        <div className="h-px bg-border/60" />
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
