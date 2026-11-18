import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getNovelList } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { getTaskOverview } from "@/api/tasks";
import { Button } from "@/components/ui/button";
import {
  buildHomeAssetHealthItems,
  buildHomeAttentionItems,
  buildHomeMetrics,
  buildHomeNextAction,
  HOME_NOVEL_FETCH_LIMIT,
  getHomeNovelActionHref,
  isHomeV2Novel,
  selectPrimaryNovel,
  type HomeNovelItem,
} from "./home/homeViewModel";
import { HomeAttentionQueue } from "./home/components/HomeAttentionQueue";
import { HomeAssetHealth } from "./home/components/HomeAssetHealth";
import { HomeNextActionPanel } from "./home/components/HomeNextActionPanel";
import { HomeStatusStrip } from "./home/components/HomeStatusStrip";
import CreationSetupNotice from "@/components/onboarding/CreationSetupNotice";
import FirstNovelJourneyStrip from "@/components/onboarding/FirstNovelJourneyStrip";

export default function Home() {
  const taskQuery = useQuery({
    queryKey: queryKeys.tasks.overview,
    queryFn: getTaskOverview,
    staleTime: 30_000,
    refetchInterval: (query) => {
      const overview = query.state.data?.data;
      return (overview?.queuedCount ?? 0) > 0 || (overview?.runningCount ?? 0) > 0 ? 4000 : false;
    },
  });

  const novelQuery = useQuery({
    queryKey: queryKeys.novels.list(1, HOME_NOVEL_FETCH_LIMIT),
    queryFn: () => getNovelList({ page: 1, limit: HOME_NOVEL_FETCH_LIMIT }),
    staleTime: 30_000,
    refetchInterval: (query) => query.state.data?.data?.items.some(novel =>
      ["queued", "running"].includes(novel.bookProgress?.director?.status ?? "")) ? 4000 : false,
  });

  const allNovels = novelQuery.data?.data?.items ?? [];
  const hasNovels = allNovels.length > 0;
  const taskOverview = taskQuery.data?.data ?? null;
  const primaryNovel = useMemo(() => selectPrimaryNovel(allNovels), [allNovels]);
  const nextAction = useMemo(() => buildHomeNextAction(primaryNovel), [primaryNovel]);
  const metrics = useMemo(
    () => buildHomeMetrics({ novels: allNovels, taskOverview }),
    [allNovels, taskOverview],
  );
  const assetHealthItems = useMemo(
    () => buildHomeAssetHealthItems(allNovels),
    [allNovels],
  );

  const attentionItems = buildHomeAttentionItems(allNovels, primaryNovel?.id);

  const renderNovelPrimaryAction = (
    novel: HomeNovelItem,
    options?: { size?: "default" | "sm" | "lg"; stopPropagation?: boolean },
  ) => {
    const href = getHomeNovelActionHref(novel);
    const size = options?.size ?? "sm";
    if (!href) {
      return <Button size={size} onClick={() => void novelQuery.refetch()}>重新读取创作入口</Button>;
    }
    return (
      <Button asChild size={size}>
        <Link to={href} onClick={options?.stopPropagation ? (event) => event.stopPropagation() : undefined}>
          {isHomeV2Novel(novel) ? "打开导演台" : "打开作品"}
        </Link>
      </Button>
    );
  };

  return (
    <div className="home-workbench space-y-6">
      <CreationSetupNotice />
      <FirstNovelJourneyStrip />
      <HomeNextActionPanel
        action={nextAction}
        primaryNovel={primaryNovel}
        loading={novelQuery.isPending}
        error={novelQuery.isError}
        onRetry={() => void novelQuery.refetch()}
        renderNovelPrimaryAction={renderNovelPrimaryAction}
      />

      {attentionItems.length > 0 ? (
        <HomeAttentionQueue items={attentionItems} onReload={() => void novelQuery.refetch()} />
      ) : null}

      <HomeStatusStrip
        metrics={metrics}
        pending={novelQuery.isPending || taskQuery.isPending}
      />

      <HomeAssetHealth items={assetHealthItems} showStarterActions={hasNovels} />
    </div>
  );
}
