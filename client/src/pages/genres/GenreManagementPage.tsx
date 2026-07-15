import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  CircleAlert,
  FileText,
  Layers3,
  LoaderCircle,
  Plus,
  Sparkles,
  Tags,
} from "lucide-react";
import { deleteGenre, flattenGenreTreeOptions, getGenreTree, type GenreTreeNode } from "@/api/genre";
import { queryKeys } from "@/api/queryKeys";
import {
  AssetLibraryEmptyState,
  AssetLibraryHeader,
  AssetLibraryRecommendation,
  AssetLibrarySection,
  AssetLibraryStatusGrid,
  type AssetLibraryStatusItem,
} from "@/components/assetLibrary";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import GenreCreateDialog from "./components/GenreCreateDialog";
import GenreEditDialog from "./components/GenreEditDialog";
import GenreTreeItem from "./components/GenreTreeItem";
import {
  collectDescendantIds,
  countGenreNovelBindingsInSubtree,
  countGenres,
  findGenreNode,
} from "./genreManagement.shared";

export default function GenreManagementPage() {
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [defaultParentId, setDefaultParentId] = useState("");
  const [editingGenreId, setEditingGenreId] = useState("");

  const genreTreeQuery = useQuery({
    queryKey: queryKeys.genres.all,
    queryFn: getGenreTree,
  });

  const genreTree = genreTreeQuery.data?.data ?? [];
  const parentOptions = useMemo(() => flattenGenreTreeOptions(genreTree), [genreTree]);
  const totalGenres = useMemo(() => countGenres(genreTree), [genreTree]);
  const linkedNovelCount = useMemo(
    () => genreTree.reduce((total, node) => total + countGenreNovelBindingsInSubtree(node), 0),
    [genreTree],
  );
  const describedGenreCount = useMemo(
    () => parentOptions.filter((option) => Boolean(option.description?.trim())).length,
    [parentOptions],
  );
  const firstGenreWithoutDescription = useMemo(
    () => parentOptions.find((option) => !option.description?.trim()) ?? null,
    [parentOptions],
  );
  const editingGenre = useMemo(
    () => (editingGenreId ? findGenreNode(genreTree, editingGenreId) : null),
    [editingGenreId, genreTree],
  );
  const blockedParentIds = useMemo(
    () => editingGenre ? new Set([editingGenre.id, ...collectDescendantIds(editingGenre)]) : new Set<string>(),
    [editingGenre],
  );
  const statusUnavailable = genreTreeQuery.isLoading || genreTreeQuery.isError;
  const statusItems = useMemo<AssetLibraryStatusItem[]>(() => [
    {
      key: "genres",
      label: "题材基底",
      value: statusUnavailable ? "—" : totalGenres,
      detail: "可供小说选择的分类节点",
      icon: Tags,
      tone: statusUnavailable ? "neutral" : "info",
    },
    {
      key: "roots",
      label: "根分类",
      value: statusUnavailable ? "—" : genreTree.length,
      detail: "用于划分主要创作方向",
      icon: Layers3,
    },
    {
      key: "novels",
      label: "关联小说",
      value: statusUnavailable ? "—" : linkedNovelCount,
      detail: "正在使用这些题材的作品",
      icon: BookOpen,
      tone: statusUnavailable ? "neutral" : linkedNovelCount > 0 ? "success" : "neutral",
    },
    {
      key: "descriptions",
      label: "说明完整",
      value: statusUnavailable ? "—" : `${describedGenreCount}/${totalGenres}`,
      detail: "有明确定位说明的题材",
      icon: FileText,
      tone: statusUnavailable
        ? "neutral"
        : totalGenres > describedGenreCount ? "warning" : "success",
    },
  ], [
    describedGenreCount,
    genreTree.length,
    linkedNovelCount,
    statusUnavailable,
    totalGenres,
  ]);

  const deleteMutation = useMutation({
    mutationFn: (genreId: string) => deleteGenre(genreId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.genres.all });
      toast.success("题材基底已删除。");
    },
  });

  const handleCreateRoot = () => {
    setDefaultParentId("");
    setCreateDialogOpen(true);
  };

  const handleCreateChild = (parentId: string) => {
    setDefaultParentId(parentId);
    setCreateDialogOpen(true);
  };

  const handleDelete = (genre: GenreTreeNode) => {
    const descendantCount = collectDescendantIds(genre).length;
    const message = descendantCount > 0
      ? `确认删除题材基底「${genre.name}」？这会同时删除其下 ${descendantCount} 个子分类，此操作不可恢复。`
      : `确认删除题材基底「${genre.name}」？此操作不可恢复。`;
    const confirmed = window.confirm(message);
    if (!confirmed) {
      return;
    }
    deleteMutation.mutate(genre.id);
  };

  const recommendation = genreTreeQuery.isError ? (
    <AssetLibraryRecommendation
      icon={CircleAlert}
      title="重新加载题材基底"
      description="暂时无法读取题材结构。重新加载后，可以继续查看、编辑和维护题材。"
      tone="danger"
      action={(
        <Button type="button" variant="outline" onClick={() => void genreTreeQuery.refetch()}>
          重新加载
        </Button>
      )}
    />
  ) : genreTreeQuery.isLoading ? (
    <AssetLibraryRecommendation
      icon={LoaderCircle}
      title="正在确认题材基底状态"
      description="加载完成后，会根据题材覆盖和说明完整度给出下一步建议。"
      tone="neutral"
    />
  ) : totalGenres === 0 ? (
    <AssetLibraryRecommendation
      icon={Sparkles}
      title="先建立第一棵题材基底树"
      description="描述你想覆盖的创作方向，可以手动搭建层级，也可以让 AI 生成草稿后再调整。"
      action={(
        <Button type="button" onClick={handleCreateRoot}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          创建题材基底
        </Button>
      )}
    />
  ) : firstGenreWithoutDescription ? (
    <AssetLibraryRecommendation
      icon={FileText}
      title={`补充「${firstGenreWithoutDescription.name}」的题材说明`}
      description="明确作品定位、读者期待和核心冲突，能帮助 AI 在开书和规划时更准确地理解这个题材。"
      tone="warning"
      action={(
        <Button
          type="button"
          variant="outline"
          onClick={() => setEditingGenreId(firstGenreWithoutDescription.id)}
        >
          补充说明
        </Button>
      )}
    />
  ) : (
    <AssetLibraryRecommendation
      icon={Sparkles}
      title="题材基底可以支持开书选择"
      description="现有题材都有明确说明。需要覆盖新的创作方向时，再新增根题材或细分子类。"
      tone="success"
      action={(
        <Button type="button" variant="outline" onClick={handleCreateRoot}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          扩充题材
        </Button>
      )}
    />
  );

  return (
    <div className="space-y-5">
      <GenreCreateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        parentOptions={parentOptions}
        defaultParentId={defaultParentId}
      />

      <GenreEditDialog
        open={Boolean(editingGenre)}
        genre={editingGenre}
        onOpenChange={(open) => {
          if (!open) {
            setEditingGenreId("");
          }
        }}
        parentOptions={parentOptions}
        blockedParentIds={blockedParentIds}
      />

      <AssetLibraryHeader
        icon={Tags}
        context="创作资产 / 小说定位"
        title="题材基底库"
        description="维护小说可复用的题材定位与分类层级。开书时选择合适的题材基底，AI 会据此理解作品类型、读者期待和主要创作方向。"
        actions={(
          <Button type="button" onClick={handleCreateRoot}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            新建题材基底树
          </Button>
        )}
      />

      <AssetLibraryStatusGrid items={statusItems} />

      {recommendation}

      <AssetLibrarySection
        title="题材结构"
        description="从主要题材逐层展开细分方向。正在被小说使用的分类，需要先调整关联小说的题材后才能删除。"
      >
        {genreTreeQuery.isLoading ? (
          <div
            className="flex min-h-40 flex-col items-center justify-center rounded-md border border-dashed border-border px-5 py-8 text-center"
            role="status"
          >
            <LoaderCircle className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
            <div className="mt-3 text-sm font-semibold text-foreground">正在加载题材结构</div>
            <div className="mt-1 text-sm text-muted-foreground">请稍候，题材与小说关联正在同步。</div>
          </div>
        ) : null}

        {genreTreeQuery.isError ? (
          <AssetLibraryEmptyState
            icon={CircleAlert}
            title="题材基底暂时无法加载"
            description="请检查服务连接后重新加载。已有题材不会受到影响。"
            action={(
              <Button type="button" variant="outline" onClick={() => void genreTreeQuery.refetch()}>
                重新加载
              </Button>
            )}
          />
        ) : null}

        {!genreTreeQuery.isLoading && !genreTreeQuery.isError && genreTree.length === 0 ? (
          <AssetLibraryEmptyState
            icon={Tags}
            title="还没有可供开书选择的题材基底"
            description="先创建一个主要题材。你可以手动填写，也可以描述创作方向，让 AI 生成包含子类的题材树草稿。"
            action={(
              <Button type="button" onClick={handleCreateRoot}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                创建第一棵题材树
              </Button>
            )}
          />
        ) : null}

        {!genreTreeQuery.isLoading && !genreTreeQuery.isError && genreTree.length > 0 ? (
          <div className="space-y-3">
            {genreTree.map((node) => (
              <GenreTreeItem
                key={node.id}
                node={node}
                onCreateChild={handleCreateChild}
                onEdit={setEditingGenreId}
                onDelete={handleDelete}
                deletingId={deleteMutation.isPending ? deleteMutation.variables : undefined}
              />
            ))}
          </div>
        ) : null}
      </AssetLibrarySection>
    </div>
  );
}
