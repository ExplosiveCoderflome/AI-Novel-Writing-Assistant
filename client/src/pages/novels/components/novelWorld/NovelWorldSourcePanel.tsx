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
  const [manualWorldTitle, setManualWorldTitle] = useState("");
  const [manualWorldSummary, setManualWorldSummary] = useState("");
  const [worldSetupMode, setWorldSetupMode] = useState<WorldSetupMode>("generate");

  return (
    <>
      <div id="novel-world-source" className="rounded-lg border border-border/70 bg-muted/20 p-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm font-medium text-foreground">Select the world source of this book</div>
            <div className="mt-1 text-sm leading-6 text-muted-foreground">
              First decide where the world of this novel comes from, and then proceed accordingly. The newly created world will be saved to the world library at the same time and associated with this book.
                                      </div>
          </div>
          <Badge variant="outline">copy of this book</Badge>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <WorldSetupChoice
            icon={Sparkles}
            title="Generated based on this book"
            description="Suitable for when the world setting is not yet clear, let the system generate the book world based on the title, introduction, selling points and type."
            selected={worldSetupMode === "generate"}
            onSelect={() => setWorldSetupMode("generate")}
          />
          <WorldSetupChoice
            icon={Download}
            title="Import from sample library"
            description="If you already have a reusable world sample, make a copy as the world in this book, and then decide whether to synchronize manually."
            selected={worldSetupMode === "import"}
            onSelect={() => setWorldSetupMode("import")}
          />
          <WorldSetupChoice
            icon={BookOpen}
            title="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
            description="When you have a clear idea, first create the skeleton of the world in this book, and then gradually complete the rules, forces, and locations."
            selected={worldSetupMode === "manual"}
            onSelect={() => setWorldSetupMode("manual")}
          />
        </div>
      </div>

      {worldSetupMode === "import" ? (
        <div className="rounded-lg border border-border/70 bg-background p-4">
          <div className="text-sm font-medium text-foreground">Import from sample library</div>
          <div className="mt-1 text-sm leading-6 text-muted-foreground">
            Importing copies the external world manual. This copy is used when this book is generated, and the external world library is not automatically modified.
                                </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <SelectControl
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={selectedImportWorldId}
              onChange={(event) => setSelectedImportWorldId(event.target.value)}
            >
              <option value="">Choose a world sample</option>
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
              {props.isImporting ? "Importing..." : "Importing as the world of this book"}
            </Button>
          </div>
          <label className="mt-3 flex items-start gap-3 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="mt-1"
              checked={syncEnabled}
              onChange={(event) => setSyncEnabled(event.target.checked)}
            />
            <span>Keep the synchronization entry after importing. The system only prompts for differences and will not automatically overwrite the book world or world library samples.</span>
          </label>
        </div>
      ) : null}

      {worldSetupMode === "generate" ? (
        <div className="rounded-lg border border-border/70 bg-background p-4">
          <div className="text-sm font-medium text-foreground">Generate a world based on this book</div>
          <div className="mt-1 text-sm leading-6 text-muted-foreground">
            The system will generate a set of book worlds based on the title, introduction, selling points, reader commitment and type information, and save it to the world library for subsequent reuse and maintenance.
                                </div>
          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => props.onGenerate({})}
              disabled={props.isGenerating || props.isCreatingManual}
            >
              <Sparkles className="size-4" />
              {props.isGenerating ? "Generating..." : "Generating the world of this book"}
            </Button>
          </div>
        </div>
      ) : null}

      {worldSetupMode === "manual" ? (
        <div className="rounded-lg border border-border/70 bg-background p-4">
          <div className="text-sm font-medium text-foreground">Customize the world of this book</div>
          <div className="mt-1 text-sm leading-6 text-muted-foreground">
            First create a blank world manual and save it to the world library simultaneously; then go to the world workbench to complete the core rules, main forces, story stages and key tensions.
                                </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-foreground">World name</span>
              <input
                className="w-full rounded-md border bg-background p-2 text-sm"
                value={manualWorldTitle}
                maxLength={80}
                placeholder="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
                onChange={(event) => setManualWorldTitle(event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-foreground">One sentence summary</span>
              <input
                className="w-full rounded-md border bg-background p-2 text-sm"
                value={manualWorldSummary}
                maxLength={300}
                placeholder="For example: a border empire with depleted star cores, both magic and power have to pay a price."
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
              {props.isCreatingManual ? "Creating..." : "Customizing the book world"}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
