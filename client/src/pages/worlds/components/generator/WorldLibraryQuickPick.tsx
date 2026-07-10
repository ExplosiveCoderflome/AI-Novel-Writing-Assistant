import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listWorldLibrary } from "@/api/world";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";

interface WorldLibraryQuickItem {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  worldType?: string | null;
  usageCount: number;
  sourceWorldId?: string | null;
}

interface WorldLibraryQuickPickProps {
  worldType?: string;
  existingOptionIds: string[];
  onAdd: (item: WorldLibraryQuickItem) => void;
}

export default function WorldLibraryQuickPick({
  worldType,
  existingOptionIds,
  onAdd,
}: WorldLibraryQuickPickProps) {
  const [keyword, setKeyword] = useState("");

  const params = useMemo(
    () => ({
      worldType: worldType?.trim() || undefined,
      keyword: keyword.trim() || undefined,
      limit: 12,
    }),
    [keyword, worldType],
  );

  const libraryQuery = useQuery({
    queryKey: queryKeys.worlds.library(JSON.stringify(params)),
    queryFn: () => listWorldLibrary(params),
    staleTime: 30_000,
  });

  const libraryItems = (libraryQuery.data?.data ?? []) as WorldLibraryQuickItem[];

  return (
    <div className="rounded-md border p-3 text-sm space-y-3">
      <div className="space-y-1">
        <div className="font-medium">{t("gen.pages.worlds.components.generator.WorldLibraryQuickPick.gen_b6708780")}</div>
        <div className="text-xs text-muted-foreground">
          旧版 V2 会在正式生成前就允许从属性库选素材。这里保留这个思路，但接到当前蓝图结构里。
        </div>
      </div>

      <input
        className="w-full rounded-md border p-2 text-sm"
        placeholder={t("gen.pages.worlds.components.generator.WorldLibraryQuickPick.gen_d2e30b24")}
        value={keyword}
        onChange={(event) => setKeyword(event.target.value)}
      />

      <div className="space-y-2">
        {libraryQuery.isLoading ? (
          <div className="text-xs text-muted-foreground">{t("gen.pages.worlds.components.generator.WorldLibraryQuickPick.gen_00b1d3f6")}</div>
        ) : null}
        {!libraryQuery.isLoading && libraryItems.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            没有匹配的素材库条目。
          </div>
        ) : null}

        {libraryItems.map((item) => {
          const added = existingOptionIds.includes(item.id);
          return (
            <div key={item.id} className="flex flex-col gap-3 rounded-md border p-3 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{item.name}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {item.category}
                  </span>
                  {item.worldType ? (
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                      {item.worldType}
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-muted-foreground whitespace-pre-wrap">
                  {item.description?.trim() || t("gen.pages.worlds.components.generator.WorldLibraryQuickPick.gen_8c3ec9df")}
                </div>
                <div className="text-xs text-muted-foreground">
                  使用次数：{item.usageCount}
                </div>
              </div>
              <Button
                type="button"
                variant={added ? "secondary" : "outline"}
                disabled={added}
                onClick={() => onAdd(item)}
              >
                {added ? t("gen.pages.worlds.components.generator.WorldLibraryQuickPick.gen_6bc042a7") : t("gen.pages.worlds.components.generator.WorldLibraryQuickPick.gen_808b8a65")}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
