import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateGenre, type GenreOption, type GenreTreeNode } from "@/api/genre";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";

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
        throw new Error("题材基底不存在。");
      }
      return updateGenre(genre.id, {
        name: name.trim(),
        description: description.trim() || null,
        parentId: parentId || null,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.genres.all });
      toast.success("题材基底已更新。");
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>编辑题材基底</DialogTitle>
          <DialogDescription>
            可以修改名称、说明和挂载位置。子节点与已绑定小说会继续保留。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">名称</span>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">描述</span>
            <textarea
              rows={4}
              className="min-h-[120px] w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">父级题材基底</span>
            <select
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
            >
              <option value="">无父级，作为根题材基底</option>
              {filteredParentOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.path}
                </option>
              ))}
            </select>
          </label>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending || !name.trim()}>
            {updateMutation.isPending ? "保存中..." : "保存修改"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
