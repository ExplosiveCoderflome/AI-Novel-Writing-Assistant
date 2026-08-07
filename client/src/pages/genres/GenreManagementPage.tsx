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
      label: "Theme base",
      value: statusUnavailable ? "—" : totalGenres,
      detail: "Category nodes for novel selection",
      icon: Tags,
      tone: statusUnavailable ? "neutral" : "info",
    },
    {
      key: "roots",
      label: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
      value: statusUnavailable ? "—" : genreTree.length,
      detail: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
      icon: Layers3,
    },
    {
      key: "novels",
      label: "Relevant novels",
      value: statusUnavailable ? "—" : linkedNovelCount,
      detail: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
      icon: BookOpen,
      tone: statusUnavailable ? "neutral" : linkedNovelCount > 0 ? "success" : "neutral",
    },
    {
      key: "descriptions",
      label: "Complete instructions",
      value: statusUnavailable ? "—" : `${describedGenreCount}/${totalGenres}`,
      detail: "Subject matter with clear positioning description",
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
      toast.success("Theme base has been deleted.");
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
      title="Reload theme base"
      description="The theme structure cannot be read at the moment. After reloading, you can continue to view, edit and maintain themes."
      tone="danger"
      action={(
        <Button type="button" variant="outline" onClick={() => void genreTreeQuery.refetch()}>
          Reload
                      </Button>
      )}
    />
  ) : genreTreeQuery.isLoading ? (
    <AssetLibraryRecommendation
      icon={LoaderCircle}
      title="Confirming the theme base status"
      description="After the loading is completed, suggestions for the next step will be given based on the subject coverage and completeness of the instructions."
      tone="neutral"
    />
  ) : totalGenres === 0 ? (
    <AssetLibraryRecommendation
      icon={Sparkles}
      title="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
      description="Describe the creative direction you want to cover. You can build the hierarchy manually, or you can let AI generate a draft and then adjust it."
      action={(
        <Button type="button" onClick={handleCreateRoot}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Create a theme base
                      </Button>
      )}
    />
  ) : firstGenreWithoutDescription ? (
    <AssetLibraryRecommendation
      icon={FileText}
      title={`补充「${firstGenreWithoutDescription.name}」的题材说明`}
      description="Clarifying the positioning of the work, readers' expectations, and core conflicts can help AI understand the subject matter more accurately when opening and planning the book."
      tone="warning"
      action={(
        <Button
          type="button"
          variant="outline"
          onClick={() => setEditingGenreId(firstGenreWithoutDescription.id)}
        >
          Additional information
                      </Button>
      )}
    />
  ) : (
    <AssetLibraryRecommendation
      icon={Sparkles}
      title="The theme base can support book opening selection"
      description="Existing themes are clearly stated. When you need to cover a new creative direction, add a new root theme or subcategory."
      tone="success"
      action={(
        <Button type="button" variant="outline" onClick={handleCreateRoot}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Expand the theme
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
        context="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
        title="Theme base library"
        description="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
        actions={(
          <Button type="button" onClick={handleCreateRoot}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Create a new theme base tree
                          </Button>
        )}
      />

      <AssetLibraryStatusGrid items={statusItems} />

      {recommendation}

      <AssetLibrarySection
        title="Theme structure"
        description="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
      >
        {genreTreeQuery.isLoading ? (
          <div
            className="flex min-h-40 flex-col items-center justify-center rounded-md border border-dashed border-border px-5 py-8 text-center"
            role="status"
          >
            <LoaderCircle className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
            <div className="mt-3 text-sm font-semibold text-foreground">Loading theme structure</div>
            <div className="mt-1 text-sm text-muted-foreground">Please wait, the subject matter and novel relationship are being synchronized.</div>
          </div>
        ) : null}

        {genreTreeQuery.isError ? (
          <AssetLibraryEmptyState
            icon={CircleAlert}
            title="The theme base cannot be loaded temporarily."
            description="Please check the service connection and reload. Existing themes will not be affected."
            action={(
              <Button type="button" variant="outline" onClick={() => void genreTreeQuery.refetch()}>
                Reload
                                  </Button>
            )}
          />
        ) : null}

        {!genreTreeQuery.isLoading && !genreTreeQuery.isError && genreTree.length === 0 ? (
          <AssetLibraryEmptyState
            icon={Tags}
            title="There is no theme base to choose from for opening a book."
            description="Start by creating a main theme. You can fill it in manually, or you can describe the creative direction and let AI generate a draft theme tree containing subcategories."
            action={(
              <Button type="button" onClick={handleCreateRoot}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Create the first theme tree
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
