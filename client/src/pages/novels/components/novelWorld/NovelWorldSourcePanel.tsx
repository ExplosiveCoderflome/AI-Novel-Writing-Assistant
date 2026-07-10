import { useState } from "react";
import { BookOpen, Download, Sparkles } from "lucide-react";
import type {
  NovelWorldGenerateInput,
  NovelWorldImportInput,
  NovelWorldManualInput,
} from "@ai-novel/shared/types/novelWorld";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import SelectControl from "@/components/common/SelectControl";

export interface WorldOption {
  id: string;
  name: string;
}

interface NovelWorldSourcePanelProps {
  worldOptions: WorldOption[];
  selectedWorldId: string;
  isImporting: boolean;
  isGenerating: boolean;
  isCreatingManual: boolean;
  onImport: (payload: NovelWorldImportInput) => void;
  onCreateManual: (payload?: NovelWorldManualInput) => void;
  onGenerate: (payload: NovelWorldGenerateInput) => void;
}

type WorldSetupMode = "generate" | "import" | "manual";

function WorldSetupChoice({
  icon: Icon,
  title,
  description,
  selected,
  onSelect,
}: {
  icon: typeof BookOpen;
  title: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={[
        "rounded-md border p-3 text-left transition-colors",
        selected ? "border-primary bg-primary/5" : "border-border/70 bg-background hover:bg-muted/40",
      ].join(" ")}
      onClick={onSelect}
    >
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
        {title}
      </div>
      <div className="mt-2 text-xs leading-5 text-muted-foreground">{description}</div>
    </button>
  );
}

export default function NovelWorldSourcePanel(props: NovelWorldSourcePanelProps) {
  const [selectedImportWorldId, setSelectedImportWorldId] = useState(props.selectedWorldId);
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [saveGeneratedToLibrary, setSaveGeneratedToLibrary] = useState(false);
  const [manualWorldTitle, setManualWorldTitle] = useState("");
  const [manualWorldSummary, setManualWorldSummary] = useState("");
  const [worldSetupMode, setWorldSetupMode] = useState<WorldSetupMode>("generate");

  return (
    <>
      <div id="novel-world-source" className="rounded-lg border border-border/70 bg-muted/20 p-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm font-medium text-foreground">选择本书世界来源</div>
            <div className="mt-1 text-sm leading-6 text-muted-foreground">
              先决定这本小说的世界从哪里来，再展开对应操作。每条路径都会生成本书自己的世界副本。
            </div>
          </div>
          <Badge variant="outline">本书副本</Badge>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <WorldSetupChoice
            icon={Sparkles}
            title="根据本书生成"
            description="适合还没有明确世界设定时，让系统根据标题、简介、卖点和类型生成本书世界。"
            selected={worldSetupMode === "generate"}
            onSelect={() => setWorldSetupMode("generate")}
          />
          <WorldSetupChoice
            icon={Download}
            title="从样本库导入"
            description="适合已有可复用世界样本时，复制一份作为本书世界，再决定是否手动同步。"
            selected={worldSetupMode === "import"}
            onSelect={() => setWorldSetupMode("import")}
          />
          <WorldSetupChoice
            icon={BookOpen}
            title="自定义空白手册"
            description="适合你有明确想法时，先创建本书世界骨架，再逐步补齐规则、势力和地点。"
            selected={worldSetupMode === "manual"}
            onSelect={() => setWorldSetupMode("manual")}
          />
        </div>
      </div>

      {worldSetupMode === "import" ? (
        <div className="rounded-lg border border-border/70 bg-background p-4">
          <div className="text-sm font-medium text-foreground">从样本库导入</div>
          <div className="mt-1 text-sm leading-6 text-muted-foreground">
            导入会复制外部世界手册。本书生成时使用这份副本，外部世界库不会被自动改动。
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <SelectControl
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={selectedImportWorldId}
              onChange={(event) => setSelectedImportWorldId(event.target.value)}
            >
              <option value="">选择一个世界样本</option>
              {props.worldOptions.map((world) => (
                <option key={world.id} value={world.id}>{world.name}</option>
              ))}
            </SelectControl>
            <Button
              type="button"
              onClick={() => props.onImport({
                worldId: selectedImportWorldId,
                syncEnabled,
                syncDirection: syncEnabled ? "bidirectional" : "none",
              })}
              disabled={!selectedImportWorldId || props.isImporting}
            >
              <Download className="size-4" />
              {props.isImporting ? "导入中..." : "导入为本书世界"}
            </Button>
          </div>
          <label className="mt-3 flex items-start gap-3 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="mt-1"
              checked={syncEnabled}
              onChange={(event) => setSyncEnabled(event.target.checked)}
            />
            <span>导入后保留同步入口。系统只提示差异，不会自动覆盖本书世界或世界库样本。</span>
          </label>
        </div>
      ) : null}

      {worldSetupMode === "generate" ? (
        <div className="rounded-lg border border-border/70 bg-background p-4">
          <div className="text-sm font-medium text-foreground">根据本书生成世界</div>
          <div className="mt-1 text-sm leading-6 text-muted-foreground">
            系统会根据标题、简介、卖点、读者承诺和类型信息生成一套本书世界。适合新书起步时快速形成可用舞台。
          </div>
          <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <label className="flex items-start gap-3 text-sm text-muted-foreground">
              <input
                type="checkbox"
                className="mt-1"
                checked={saveGeneratedToLibrary}
                onChange={(event) => setSaveGeneratedToLibrary(event.target.checked)}
              />
              <span>生成后保存到世界库，方便其他小说复用。</span>
            </label>
            <Button
              type="button"
              variant="secondary"
              onClick={() => props.onGenerate({ saveToLibrary: saveGeneratedToLibrary })}
              disabled={props.isGenerating || props.isCreatingManual}
            >
              <Sparkles className="size-4" />
              {props.isGenerating ? "生成中..." : "生成本书世界"}
            </Button>
          </div>
        </div>
      ) : null}

      {worldSetupMode === "manual" ? (
        <div className="rounded-lg border border-border/70 bg-background p-4">
          <div className="text-sm font-medium text-foreground">自定义本书世界</div>
          <div className="mt-1 text-sm leading-6 text-muted-foreground">
            先创建一份空白世界手册，再到世界工作台补齐核心规则、主要势力、故事舞台和关键张力。
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-foreground">世界名称</span>
              <input
                className="w-full rounded-md border bg-background p-2 text-sm"
                value={manualWorldTitle}
                maxLength={80}
                placeholder="例如：紫霞界"
                onChange={(event) => setManualWorldTitle(event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-foreground">一句话概要</span>
              <input
                className="w-full rounded-md border bg-background p-2 text-sm"
                value={manualWorldSummary}
                maxLength={300}
                placeholder="例如：星核枯竭的边境帝国，魔法与权力都要付出代价。"
                onChange={(event) => setManualWorldSummary(event.target.value)}
              />
            </label>
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => props.onCreateManual({
                title: manualWorldTitle.trim() || undefined,
                coverSummary: manualWorldSummary.trim() || undefined,
              })}
              disabled={props.isCreatingManual || props.isGenerating}
            >
              <BookOpen className="size-4" />
              {props.isCreatingManual ? "创建中..." : "自定义本书世界"}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
