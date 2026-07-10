import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
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
            <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.novelWorld.NovelWorldSourcePanel.gen_756d536c")}</div>
            <div className="mt-1 text-sm leading-6 text-muted-foreground">
              先决定这本小说的世界从哪里来，再展开对应操作。每条路径都会生成本书自己的世界副本。
            </div>
          </div>
          <Badge variant="outline">{t("gen.pages.novels.components.novelWorld.NovelWorldSourcePanel.gen_1dce4d42")}</Badge>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <WorldSetupChoice
            icon={Sparkles}
            title={t("gen.pages.novels.components.novelWorld.NovelWorldSourcePanel.gen_b7ab0cfd")}
            description={t("gen.pages.novels.components.novelWorld.NovelWorldSourcePanel.gen_e270c2d5")}
            selected={worldSetupMode === "generate"}
            onSelect={() => setWorldSetupMode("generate")}
          />
          <WorldSetupChoice
            icon={Download}
            title={t("gen.pages.novels.components.novelWorld.NovelWorldSourcePanel.importFromSampleLibrary")}
            description={t("gen.pages.novels.components.novelWorld.NovelWorldSourcePanel.gen_6b92888c")}
            selected={worldSetupMode === "import"}
            onSelect={() => setWorldSetupMode("import")}
          />
          <WorldSetupChoice
            icon={BookOpen}
            title={t("gen.pages.novels.components.novelWorld.NovelWorldSourcePanel.gen_f7f1f234")}
            description={t("gen.pages.novels.components.novelWorld.NovelWorldSourcePanel.gen_cbf390be")}
            selected={worldSetupMode === "manual"}
            onSelect={() => setWorldSetupMode("manual")}
          />
        </div>
      </div>

      {worldSetupMode === "import" ? (
        <div className="rounded-lg border border-border/70 bg-background p-4">
          <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.novelWorld.NovelWorldSourcePanel.importFromSampleLibrary")}</div>
          <div className="mt-1 text-sm leading-6 text-muted-foreground">
            导入会复制外部世界手册。本书生成时使用这份副本，外部世界库不会被自动改动。
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <SelectControl
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={selectedImportWorldId}
              onChange={(event) => setSelectedImportWorldId(event.target.value)}
            >
              <option value="">{t("gen.pages.novels.components.novelWorld.NovelWorldSourcePanel.gen_7e03b9ad")}</option>
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
              {props.isImporting ? t("gen.pages.novels.components.novelWorld.NovelWorldSourcePanel.gen_763476f8") : t("gen.pages.novels.components.novelWorld.NovelWorldSourcePanel.gen_af9f3ef4")}
            </Button>
          </div>
          <label className="mt-3 flex items-start gap-3 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="mt-1"
              checked={syncEnabled}
              onChange={(event) => setSyncEnabled(event.target.checked)}
            />
            <span>{t("gen.pages.novels.components.novelWorld.NovelWorldSourcePanel.gen_c3ffd652")}</span>
          </label>
        </div>
      ) : null}

      {worldSetupMode === "generate" ? (
        <div className="rounded-lg border border-border/70 bg-background p-4">
          <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.novelWorld.NovelWorldSourcePanel.gen_1d261656")}</div>
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
              <span>{t("gen.pages.novels.components.novelWorld.NovelWorldSourcePanel.gen_8d6992ba")}</span>
            </label>
            <Button
              type="button"
              variant="secondary"
              onClick={() => props.onGenerate({ saveToLibrary: saveGeneratedToLibrary })}
              disabled={props.isGenerating || props.isCreatingManual}
            >
              <Sparkles className="size-4" />
              {props.isGenerating ? t("gen.pages.novels.components.novelWorld.NovelWorldSourcePanel.gen_4d020ba3") : t("gen.pages.novels.components.novelWorld.NovelWorldSourcePanel.gen_0aee178e")}
            </Button>
          </div>
        </div>
      ) : null}

      {worldSetupMode === "manual" ? (
        <div className="rounded-lg border border-border/70 bg-background p-4">
          <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.novelWorld.NovelWorldSourcePanel.gen_e1010a5d")}</div>
          <div className="mt-1 text-sm leading-6 text-muted-foreground">
            先创建一份空白世界手册，再到世界工作台补齐核心规则、主要势力、故事舞台和关键张力。
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-foreground">{t("gen.pages.novels.components.novelWorld.NovelWorldSourcePanel.worldName")}</span>
              <input
                className="w-full rounded-md border bg-background p-2 text-sm"
                value={manualWorldTitle}
                maxLength={80}
                placeholder={t("gen.pages.novels.components.novelWorld.NovelWorldSourcePanel.examplePurpleSkyRealm")}
                onChange={(event) => setManualWorldTitle(event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-foreground">{t("gen.pages.novels.components.novelWorld.NovelWorldSourcePanel.oneLineSummary")}</span>
              <input
                className="w-full rounded-md border bg-background p-2 text-sm"
                value={manualWorldSummary}
                maxLength={300}
                placeholder={t("gen.pages.novels.components.novelWorld.NovelWorldSourcePanel.exampleStarcoreDepletedBorderEmpireMagicAndPowerHaveCost")}
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
              {props.isCreatingManual ? t("gen.pages.novels.components.novelWorld.NovelWorldSourcePanel.gen_b26107b6") : t("gen.pages.novels.components.novelWorld.NovelWorldSourcePanel.gen_e1010a5d")}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
