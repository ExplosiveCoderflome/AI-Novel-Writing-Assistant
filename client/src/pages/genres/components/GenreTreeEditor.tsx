import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GenreTreeDraft } from "@/api/genre";
import { createEmptyGenreDraft } from "../genreManagement.shared";

interface GenreTreeEditorProps {
  value: GenreTreeDraft;
  onChange: (next: GenreTreeDraft) => void;
  depth?: number;
  maxDepth?: number;
}

function getLevelLabel(depth: number): string {
  if (depth === 0) {
    return t("gen.pages.genres.components.GenreTreeEditor.mainType");
  }
  if (depth === 1) {
    return t("gen.pages.genres.components.GenreTreeEditor.gen_2a89ece2");
  }
  return t("gen.pages.genres.components.GenreTreeEditor.subType");
}

export default function GenreTreeEditor({
  value,
  onChange,
  depth = 0,
  maxDepth = 2,
}: GenreTreeEditorProps) {
  const canAddChild = depth < maxDepth;

  const updateChild = (index: number, nextChild: GenreTreeDraft) => {
    onChange({
      ...value,
      children: value.children.map((child, childIndex) => (childIndex === index ? nextChild : child)),
    });
  };

  const removeChild = (index: number) => {
    onChange({
      ...value,
      children: value.children.filter((_, childIndex) => childIndex !== index),
    });
  };

  const addChild = () => {
    onChange({
      ...value,
      children: [...value.children, createEmptyGenreDraft()],
    });
  };

  return (
    <div className={`space-y-3 rounded-xl border bg-muted/10 p-4 ${depth > 0 ? "border-dashed" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-foreground">{getLevelLabel(depth)}</div>
          <div className="text-xs text-muted-foreground">
            {depth === 0 ? t("gen.pages.genres.components.GenreTreeEditor.gen_64dc879a") : t("gen.pages.genres.components.GenreTreeEditor.gen_4bd10a36")}
          </div>
        </div>
        {canAddChild ? (
          <Button type="button" variant="outline" size="sm" onClick={addChild}>
            新增{depth === 0 ? t("gen.pages.genres.components.GenreTreeEditor.gen_2a89ece2") : t("gen.pages.genres.components.GenreTreeEditor.subType")}
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-2 text-sm">
          <span className="font-medium text-foreground">{t("gen.pages.genres.components.GenreTreeEditor.gen_d7ec2d3f")}</span>
          <Input
            value={value.name}
            placeholder={depth === 0 ? t("gen.pages.genres.components.GenreTreeEditor.gen_例如都市异能_wk8i") : t("gen.pages.genres.components.GenreTreeEditor.exampleSupernaturalWorkplace")}
            onChange={(event) => onChange({ ...value, name: event.target.value })}
          />
        </label>

        <label className="space-y-2 text-sm md:col-span-2">
          <span className="font-medium text-foreground">{t("gen.pages.genres.components.GenreTreeEditor.gen_3bdd08ad")}</span>
          <textarea
            rows={3}
            className="min-h-[96px] w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={value.description ?? ""}
            placeholder={t("gen.pages.genres.components.GenreTreeEditor.gen_20e1df31")}
            onChange={(event) => onChange({ ...value, description: event.target.value })}
          />
        </label>
      </div>

      {value.children.length > 0 ? (
        <div className="space-y-3">
          {value.children.map((child, index) => (
            <div key={`${depth}-${index}`} className="space-y-2">
              <div className="flex items-center justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => removeChild(index)}
                >
                  删除当前节点
                </Button>
              </div>
              <GenreTreeEditor
                value={child}
                onChange={(nextChild) => updateChild(index, nextChild)}
                depth={depth + 1}
                maxDepth={maxDepth}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
