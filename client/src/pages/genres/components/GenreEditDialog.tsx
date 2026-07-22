import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateGenre, type GenreOption, type GenreTreeNode } from "@/api/genre";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AppDialogContent,
  Dialog,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import SelectControl from "@/components/common/SelectControl";

interface GenreEditDialogProps {
  open: boolean;
  genre: GenreTreeNode | null;
  onOpenChange: (open: boolean) => void;
  parentOptions: GenreOption[];
  blockedParentIds: Set<string>;
}

export default function GenreEditDialog({
  open,
  genre,
  onOpenChange,
  parentOptions,
  blockedParentIds,
}: GenreEditDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState("");

  useEffect(() => {
    if (!open || !genre) {
      return;
    }
    setName(genre.name);
    setDescription(genre.description ?? "");
    setParentId(genre.parentId ?? "");
  }, [genre, open]);

  const filteredParentOptions = useMemo(
    () => parentOptions.filter((option) => !blockedParentIds.has(option.id)),
    [blockedParentIds, parentOptions],
  );

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!genre) {
        throw new Error(t("gen.pages.genres.components.GenreEditDialog.gen_ea1adb0b"));
      }
      return updateGenre(genre.id, {
        name: name.trim(),
        description: description.trim() || null,
        parentId: parentId || null,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.genres.all });
      toast.success(t("gen.pages.genres.components.GenreEditDialog.gen_14c7a9d3"));
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        className="max-w-2xl"
        title={t("gen.pages.genres.components.GenreEditDialog.gen_41b8084b")}
        description={t("gen.pages.genres.components.GenreEditDialog.gen_f060ecf0")}
        footer={(
          <>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="button" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending || !name.trim()}>
              {updateMutation.isPending ? t("gen.pages.genres.components.GenreEditDialog.savingInProgressDotDotDot") : t("gen.pages.genres.components.GenreEditDialog.saveChanges")}
            </Button>
          </>
        )}
        footerClassName="gap-2"
      >
        <div className="space-y-4">
          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">{t("gen.pages.genres.components.GenreEditDialog.gen_d7ec2d3f")}</span>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">{t("gen.pages.genres.components.GenreEditDialog.gen_3bdd08ad")}</span>
            <textarea
              rows={4}
              className="min-h-[120px] w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">{t("gen.pages.genres.components.GenreEditDialog.gen_3f0265bd")}</span>
            <SelectControl
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
            >
              <option value="">{t("gen.pages.genres.components.GenreEditDialog.gen_a6072d41")}</option>
              {filteredParentOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.path}
                </option>
              ))}
            </SelectControl>
          </label>
        </div>
      </AppDialogContent>
    </Dialog>
  );
}
