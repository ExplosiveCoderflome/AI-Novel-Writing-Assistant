import i18next from "i18next";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t, i18n } = useTranslation();
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
      label: i18next.t("basicInfo.genreId"),
      value: statusUnavailable ? "—" : totalGenres,
      detail: i18next.t("genres.genreManagementPage.7h70jj"),
      icon: Tags,
      tone: statusUnavailable ? "neutral" : "info",
    },
    {
      key: "roots",
      label: i18next.t("genres.genreManagementPage.fo75a"),
      value: statusUnavailable ? "—" : genreTree.length,
      detail: i18next.t("genres.genreManagementPage.wl0ftl"),
      icon: Layers3,
    },
    {
      key: "novels",
      label: i18next.t("genres.genreManagementPage.at2z0m"),
      value: statusUnavailable ? "—" : linkedNovelCount,
      detail: i18next.t("genres.genreManagementPage.k71p7l"),
      icon: BookOpen,
      tone: statusUnavailable ? "neutral" : linkedNovelCount > 0 ? "success" : "neutral",
    },
    {
      key: "descriptions",
      label: i18next.t("genres.genreManagementPage.i2vbeq"),
      value: statusUnavailable ? "—" : `${describedGenreCount}/${totalGenres}`,
      detail: i18next.t("genres.genreManagementPage.u87vlm"),
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
      toast.success(i18next.t("dict.gen_b67dd646"));
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
      ? i18next.t("genres.genreManagementPage.r9bygx", { val1: genre.name, val2: descendantCount })
      : i18next.t("genres.genreManagementPage.s9w39f", { val1: genre.name });
    const confirmed = window.confirm(message);
    if (!confirmed) {
      return;
    }
    deleteMutation.mutate(genre.id);
  };

  const recommendation = genreTreeQuery.isError ? (
    <AssetLibraryRecommendation
      icon={CircleAlert}
      title={i18next.t("genres.genreManagementPage.6v4w8j")}
      description={i18next.t("genres.genreManagementPage.az2s4r")}
      tone="danger"
      action={(
        <Button type="button" variant="outline" onClick={() => void genreTreeQuery.refetch()}>{i18next.t("common.retry")}</Button>
      )}
    />
  ) : genreTreeQuery.isLoading ? (
    <AssetLibraryRecommendation
      icon={LoaderCircle}
      title={i18next.t("genres.genreManagementPage.65bamf")}
      description={i18next.t("genres.genreManagementPage.hdg1sh")}
      tone="neutral"
    />
  ) : totalGenres === 0 ? (
    <AssetLibraryRecommendation
      icon={Sparkles}
      title={i18next.t("genres.genreManagementPage.buc1fu")}
      description={i18next.t("genres.genreManagementPage.bcyed1")}
      action={(
        <Button type="button" onClick={handleCreateRoot}>
          <Plus className="h-4 w-4" aria-hidden="true" />{i18next.t("genres.genreManagementPage.rj4n8u")}</Button>
      )}
    />
  ) : firstGenreWithoutDescription ? (
    <AssetLibraryRecommendation
      icon={FileText}
      title={i18next.t("genres.genreManagementPage.gxn545", { val1: firstGenreWithoutDescription.name })}
      description={i18next.t("genres.genreManagementPage.u3amk1")}
      tone="warning"
      action={(
        <Button
          type="button"
          variant="outline"
          onClick={() => setEditingGenreId(firstGenreWithoutDescription.id)}
        >{i18next.t("genres.genreManagementPage.hjw9ay")}</Button>
      )}
    />
  ) : (
    <AssetLibraryRecommendation
      icon={Sparkles}
      title={i18next.t("genres.genreManagementPage.jn6269")}
      description={i18next.t("genres.genreManagementPage.3gf4sq")}
      tone="success"
      action={(
        <Button type="button" variant="outline" onClick={handleCreateRoot}>
          <Plus className="h-4 w-4" aria-hidden="true" />{i18next.t("genres.genreManagementPage.crheic")}</Button>
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
        title={i18next.t("sidebar.genres")}
        description={i18next.t("genres.genreManagementPage.7im1t9")}
        actions={(
          <Button type="button" onClick={handleCreateRoot}>
            <Plus className="h-4 w-4" aria-hidden="true" />{i18next.t("dict.gen_32f3aaf4")}</Button>
        )}
      />

      <AssetLibraryStatusGrid items={statusItems} />

      {recommendation}

      <AssetLibrarySection
        title={i18next.t("genres.genreManagementPage.jom85l")}
        description={i18next.t("genres.genreManagementPage.nfldlo")}
      >
        {genreTreeQuery.isLoading ? (
          <div
            className="flex min-h-40 flex-col items-center justify-center rounded-md border border-dashed border-border px-5 py-8 text-center"
            role="status"
          >
            <LoaderCircle className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
            <div className="mt-3 text-sm font-semibold text-foreground">{i18next.t("genres.genreManagementPage.2es6lx")}</div>
            <div className="mt-1 text-sm text-muted-foreground">{i18next.t("genres.genreManagementPage.ubt6dr")}</div>
          </div>
        ) : null}

        {genreTreeQuery.isError ? (
          <AssetLibraryEmptyState
            icon={CircleAlert}
            title={i18next.t("genres.genreManagementPage.wucaxz")}
            description={i18next.t("genres.genreManagementPage.yy1il6")}
            action={(
              <Button type="button" variant="outline" onClick={() => void genreTreeQuery.refetch()}>{i18next.t("common.retry")}</Button>
            )}
          />
        ) : null}

        {!genreTreeQuery.isLoading && !genreTreeQuery.isError && genreTree.length === 0 ? (
          <AssetLibraryEmptyState
            icon={Tags}
            title={i18next.t("genres.genreManagementPage.vlwi2j")}
            description={i18next.t("genres.genreManagementPage.ufcy6p")}
            action={(
              <Button type="button" onClick={handleCreateRoot}>
                <Plus className="h-4 w-4" aria-hidden="true" />{i18next.t("genres.genreManagementPage.3bhqp5")}</Button>
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
