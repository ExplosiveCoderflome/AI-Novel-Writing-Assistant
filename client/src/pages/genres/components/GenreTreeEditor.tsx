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
    return "main type";
  }
  if (depth === 1) {
    return "subtype";
  }
  return "Subordinate type";
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
            {depth === 0 ? "这是最终会创建进系统里的根节点。" : "This will be saved as a child node of the previous type."}
          </div>
        </div>
        {canAddChild ? (
          <Button type="button" variant="outline" size="sm" onClick={addChild}>
            New{depth === 0 ? "subtype" : "Subordinate type"}
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-2 text-sm">
          <span className="font-medium text-foreground">name</span>
          <Input
            value={value.name}
            placeholder={depth === 0 ? "For example: urban superpowers" : "For example: Extraordinary workplace"}
            onChange={(event) => onChange({ ...value, name: event.target.value })}
          />
        </label>

        <label className="space-y-2 text-sm md:col-span-2">
          <span className="font-medium text-foreground">Description</span>
          <textarea
            rows={3}
            className="min-h-[96px] w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={value.description ?? ""}
            placeholder="Describe the core, exciting points, common threads, or readers’ expectations of this genre."
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
                  Delete current node
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
