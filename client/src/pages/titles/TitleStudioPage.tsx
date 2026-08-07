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
            <h1 className="text-3xl font-semibold tracking-normal text-foreground">Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.</h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Use project materials, work briefs or reference titles to generate candidates; the titles you like can be copied or stored in the title library for repeated use.
                                      </p>
          </div>

          <TabsList className="grid h-10 w-full grid-cols-2 bg-muted/35 p-1 md:w-[300px]">
            <TabsTrigger value="factory">Generate candidates</TabsTrigger>
            <TabsTrigger value="library">title library</TabsTrigger>
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
