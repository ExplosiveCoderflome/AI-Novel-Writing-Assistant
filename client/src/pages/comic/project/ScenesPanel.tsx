import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Image as ImageIcon,
  Loader2,
  MapPin,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import {
  comicSceneImageUrl,
  createComicScene,
  deleteComicScene,
  generateComicSceneImage,
  listComicScenes,
  prepareComicSceneImage,
  updateComicScene,
  uploadComicSceneImage,
  type ComicScene,
  type SceneBible,
  type SceneSheetData,
  type SceneType,
} from "@/api/comic";
import { ImageGenerationConfirmDialog } from "@/components/image/ImageGenerationConfirmDialog";
import { useImageGenerationFlow } from "@/components/image/useImageGenerationFlow";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import SelectControl from "@/components/common/SelectControl";

const SCENE_TYPE_LABELS: Record<SceneType, string> = {
  interior: t("gen.pages.comic.project.ScenesPanel.gen_4fd46565"),
  exterior: t("gen.pages.comic.project.ScenesPanel.gen_bf8f50c7"),
  landscape: t("gen.pages.comic.project.ScenesPanel.gen_fc30335a"),
  abstract: t("gen.pages.comic.project.ScenesPanel.gen_d8f11435"),
  other: t("gen.pages.comic.project.ScenesPanel.gen_0d98c747"),
};

const BIBLE_FIELDS: Array<{ key: keyof SceneBible; label: string; placeholder: string }> = [
  { key: "palette", label: t("gen.pages.comic.project.ScenesPanel.gen_cd99c486"), placeholder: t("gen.pages.comic.project.ScenesPanel.gen_e797771e") },
  { key: "keyElements", label: t("gen.pages.comic.project.ScenesPanel.gen_aa847230"), placeholder: t("gen.pages.comic.project.ScenesPanel.gen_872d6f35") },
  { key: "materials", label: t("gen.pages.comic.project.ScenesPanel.gen_e3623348"), placeholder: t("gen.pages.comic.project.ScenesPanel.gen_1503e10b") },
  { key: "ambiance", label: t("gen.pages.comic.project.ScenesPanel.gen_852d1479"), placeholder: t("gen.pages.comic.project.ScenesPanel.gen_9a1252d3") },
  { key: "layout", label: t("gen.pages.comic.project.ScenesPanel.gen_1d86438b"), placeholder: t("gen.pages.comic.project.ScenesPanel.gen_dcf37314") },
];

function parseBible(raw: string | null): SceneBible {
  if (!raw) return {};
  try { return JSON.parse(raw) as SceneBible; } catch { return {}; }
}

function parseSheetData(raw: string | null): SceneSheetData {
  if (!raw) return { status: "idle" };
  try { return JSON.parse(raw) as SceneSheetData; } catch { return { status: "idle" }; }
}

function SceneList({
  scenes,
  selectedId,
  onSelect,
}: {
  scenes: ComicScene[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="overflow-hidden rounded-lg border bg-background">
      <div className="border-b px-3 py-3">
        <p className="text-sm font-semibold">{t("gen.pages.comic.project.ScenesPanel.gen_b30e5c25")}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{t("gen.pages.comic.project.ScenesPanel.gen_925537c0")}</p>
      </div>
      <div className="max-h-[640px] overflow-y-auto p-2">
        <div className="space-y-1">
          {scenes.map((scene) => {
            const sheet = parseSheetData(scene.sheetData);
            const hasSheet = sheet.status === "done";
            const isSelected = scene.id === selectedId;
            return (
              <button
                key={scene.id}
                type="button"
                className={[
                  "group w-full rounded-md border px-3 py-2 text-left transition-colors",
                  isSelected ? "border-primary bg-primary/10" : "border-transparent hover:border-border hover:bg-muted/60",
                ].join(" ")}
                onClick={() => onSelect(scene.id)}
              >
                <div className="flex items-start gap-2">
                  <div className="relative mt-0.5 flex h-8 w-10 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    {hasSheet && (
                      <img
                        src={comicSceneImageUrl(scene.id)}
                        alt={scene.name}
                        className="absolute inset-0 h-full w-full object-cover"
                        loading="lazy"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{scene.name}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {SCENE_TYPE_LABELS[scene.sceneType]}
                      {hasSheet && <span className="ml-1.5 text-primary">{t("gen.pages.comic.project.ScenesPanel.gen_6bd9342d")}</span>}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

function SceneDetail({
  scene,
  projectId,
  provider,
  onChanged,
}: {
  scene: ComicScene;
  projectId: string;
  provider: string;
  onChanged: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(scene.name);
  const [sceneType, setSceneType] = useState<SceneType>(scene.sceneType);
  const [bible, setBible] = useState<SceneBible>(parseBible(scene.bible));
  const flow = useImageGenerationFlow();

  const sheet = parseSheetData(scene.sheetData);
  const hasSheet = sheet.status === "done";
  const isGenerating = sheet.status === "generating";

  const saveMut = useMutation({
    mutationFn: () => updateComicScene(scene.id, { name: name.trim(), sceneType, bible }),
    onSuccess: () => { onChanged(); toast.success(t("gen.pages.comic.project.ScenesPanel.gen_eaf9301f")); },
    onError: (e) => toast.error(String(e)),
  });

  const startGenerate = () => {
    flow.start({
      prepare: () => prepareComicSceneImage(scene.id, provider || undefined),
      generate: (overrides) => generateComicSceneImage(scene.id, provider || undefined, overrides),
      onSuccess: () => onChanged(),
      onError: () => onChanged(),
    });
  };

  const uploadMut = useMutation({
    mutationFn: (file: File) => uploadComicSceneImage(scene.id, file),
    onSuccess: () => onChanged(),
    onError: (e) => toast.error(String(e)),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteComicScene(scene.id),
    onSuccess: () => onChanged(),
    onError: (e) => toast.error(String(e)),
  });

  const generatingBusy = flow.dialogProps.loading || flow.dialogProps.submitting || isGenerating;

  return (
    <>
      <ImageGenerationConfirmDialog {...flow.dialogProps} />
      <section className="min-w-0 overflow-hidden rounded-lg border bg-background">
      <div className="flex items-start justify-between gap-3 border-b px-4 py-4">
        <div className="min-w-0 flex-1 space-y-2">
          <input
            className="w-full rounded-md border bg-background px-3 py-1.5 text-base font-semibold"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <SelectControl
            className="rounded-md border bg-background px-2 py-1 text-xs"
            value={sceneType}
            onChange={(e) => setSceneType(e.target.value as SceneType)}
          >
            {Object.entries(SCENE_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </SelectControl>
        </div>
        <button
          type="button"
          title={t("gen.pages.comic.project.ScenesPanel.gen_f141ac85")}
          disabled={deleteMut.isPending}
          className="shrink-0 rounded border p-1.5 text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
          onClick={() => deleteMut.mutate()}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.7fr)]">
        {/* 场景圣经编辑 */}
        <div className="min-w-0 space-y-3 border-b p-4 lg:border-b-0 lg:border-r">
          <p className="text-sm font-medium">{t("gen.pages.comic.project.ScenesPanel.gen_500f3bd6")}</p>
          <p className="text-xs text-muted-foreground">
            这些视觉约束会在生成该场景下每一格时注入提示词，锁定空间一致性。
          </p>
          {BIBLE_FIELDS.map((field) => (
            <div key={field.key} className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
              <input
                className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs"
                placeholder={field.placeholder}
                value={bible[field.key] ?? ""}
                onChange={(e) => setBible((b) => ({ ...b, [field.key]: e.target.value }))}
              />
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            disabled={saveMut.isPending || !name.trim()}
            onClick={() => saveMut.mutate()}
          >
            {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            保存场景圣经
          </Button>
        </div>

        {/* 设定图 */}
        <aside className="min-w-0 p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">{t("gen.pages.comic.project.ScenesPanel.gen_e847f2b4")}</p>
            {sheet.origin && hasSheet && (
              <span className="text-[10px] text-muted-foreground">
                {sheet.origin === "uploaded" ? t("gen.pages.comic.project.ScenesPanel.gen_ba7f57c5") : t("gen.pages.comic.project.ScenesPanel.aiGenerated")}
              </span>
            )}
          </div>
          <div className="flex min-h-[180px] items-center justify-center overflow-hidden rounded-md border bg-muted/30">
            {hasSheet ? (
              <img
                src={comicSceneImageUrl(scene.id)}
                alt={scene.name}
                className="max-h-[280px] w-full object-contain"
                loading="lazy"
              />
            ) : generatingBusy ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="h-7 w-7 animate-spin" />
                <span className="text-xs">{t("gen.pages.comic.project.ScenesPanel.gen_b0b83a3f")}</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
                <ImageIcon className="h-8 w-8 opacity-30" />
                <span className="text-xs">{t("gen.pages.comic.project.ScenesPanel.gen_e6b2b290")}</span>
              </div>
            )}
          </div>
          {sheet.status === "error" && (
            <p className="mt-1.5 text-[11px] text-destructive">{sheet.error}</p>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            设定图会作为低权重参考图传给图像模型，只锁定色调/布局/材质，镜头仍按每格自由运镜。建议先保存场景圣经再生成。
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="flex-1"
              disabled={generatingBusy || uploadMut.isPending}
              onClick={startGenerate}
            >
              {generatingBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {hasSheet ? t("gen.pages.comic.project.ScenesPanel.gen_a7c23201") : t("gen.pages.comic.project.ScenesPanel.aiGenerated")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={generatingBusy || uploadMut.isPending}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploadMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              上传
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadMut.mutate(file);
              e.target.value = "";
            }}
          />
        </aside>
      </div>
      </section>
    </>
  );
}

export function ScenesPanel({
  project,
  provider,
}: {
  project: { id: string };
  provider: string;
}) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const [newName, setNewName] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const scenesKey = ["comic", "scenes", project.id];
  const { data: scenes = [], isLoading } = useQuery({
    queryKey: scenesKey,
    queryFn: () => listComicScenes(project.id),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: scenesKey });

  const createMut = useMutation({
    mutationFn: () => createComicScene({ projectId: project.id, name: newName.trim() }),
    onSuccess: (scene) => {
      refresh();
      setSelectedId(scene.id);
      setNewName("");
      setShowAdd(false);
    },
    onError: (e) => toast.error(String(e)),
  });

  const selected = scenes.find((s) => s.id === selectedId) ?? scenes[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          场景在生成分格脚本时自动识别，可在此编辑场景圣经并生成设定图，用于锁定跨格/跨话的空间一致性。
        </p>
        <Button type="button" size="sm" variant="outline" onClick={() => setShowAdd((v) => !v)}>
          <Plus className="h-4 w-4" />
          添加场景
        </Button>
      </div>

      {showAdd && (
        <div className="flex gap-2 rounded-md border bg-muted/20 p-3">
          <input
            className="flex-1 rounded border bg-background px-2 py-1 text-sm"
            placeholder={t("gen.pages.comic.project.ScenesPanel.gen_0c1e726b")}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) createMut.mutate(); }}
          />
          <Button type="button" size="sm" disabled={!newName.trim() || createMut.isPending} onClick={() => createMut.mutate()}>
            确认
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => { setShowAdd(false); setNewName(""); }}>
            取消
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">{t("gen.pages.comic.project.ScenesPanel.gen_26b5bd49")}</div>
      ) : scenes.length === 0 ? (
        <div className="space-y-2 py-12 text-center text-sm text-muted-foreground">
          <MapPin className="mx-auto h-10 w-10 opacity-30" />
          <p>{t("gen.pages.comic.project.ScenesPanel.gen_28618e83")}</p>
          <p className="text-xs">{t("gen.pages.comic.project.ScenesPanel.gen_0138d439")}</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          <SceneList scenes={scenes} selectedId={selected?.id ?? ""} onSelect={setSelectedId} />
          {selected && (
            <SceneDetail
              key={selected.id}
              scene={selected}
              projectId={project.id}
              provider={provider}
              onChanged={refresh}
            />
          )}
        </div>
      )}
    </div>
  );
}
