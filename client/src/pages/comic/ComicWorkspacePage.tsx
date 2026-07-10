import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpenText,
  FilePen,
  Layers3,
  Plus,
  Sparkles,
  SquareStack,
} from "lucide-react";
import {
  createComicProject,
  importComicSourceBundle,
  listComicProjects,
  type ComicProject,
  type ComicSourceType,
  type CreateComicProjectPayload,
} from "@/api/comic";
import { ComicImageGenerationNotice } from "@/pages/comic/ComicImageGenerationNotice";
import { getNovelList } from "@/api/novel/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import SelectControl from "@/components/common/SelectControl";

// ─── Constants ────────────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<ComicSourceType, string> = {
  novel_import: t("gen.pages.comic.ComicWorkspacePage.gen_d093e95b"),
  original: t("gen.pages.comic.ComicWorkspacePage.gen_de6d7781"),
  text_import: t("gen.pages.comic.ComicWorkspacePage.gen_8ffd512f"),
  comic_import: t("gen.pages.comic.ComicWorkspacePage.gen_c12f11f5"),
};

const STYLE_PRESETS = [
  { value: "webtoon_color", label: t("gen.pages.comic.ComicWorkspacePage.gen_b8cc9e43") },
  { value: "bl_manga", label: t("gen.pages.comic.ComicWorkspacePage.gen_3cd93268") },
  { value: "shounen_bw", label: t("gen.pages.comic.ComicWorkspacePage.gen_4a12b411") },
  { value: "ink_traditional", label: t("gen.pages.comic.ComicWorkspacePage.gen_452631b4") },
  { value: "chibi", label: t("gen.pages.comic.ComicWorkspacePage.cuteComicStyle") },
  { value: "realistic", label: t("gen.pages.comic.ComicWorkspacePage.gen_11eaab19") },
];

export interface ComicFormatDef {
  value: string;
  label: string;
  desc: string;
  tag: string;
  imageSize: string;
  promptKeywords: string;
  layoutSvg: React.ReactNode;
}

export const COMIC_FORMATS: ComicFormatDef[] = [
  {
    value: "webtoon",
    label: t("gen.pages.comic.ComicWorkspacePage.gen_3467bf28"),
    desc: t("gen.pages.comic.ComicWorkspacePage.gen_188a633d"),
    tag: t("gen.pages.comic.ComicWorkspacePage.gen_c062d322"),
    imageSize: "1024x1536",
    promptKeywords: "webtoon vertical strip panel, tall single frame, mobile scroll comic",
    layoutSvg: (
      <svg viewBox="0 0 60 90" className="w-full h-full">
        <rect x="4" y="4" width="52" height="24" rx="2" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5" />
        <rect x="4" y="33" width="52" height="24" rx="2" fill="currentColor" opacity="0.1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="4" y="62" width="52" height="24" rx="2" fill="currentColor" opacity="0.08" stroke="currentColor" strokeWidth="1.5" />
        <line x1="30" y1="10" x2="30" y2="22" stroke="currentColor" strokeWidth="0.8" opacity="0.3" />
        <circle cx="20" cy="16" r="4" fill="currentColor" opacity="0.2" />
      </svg>
    ),
  },
  {
    value: "4koma",
    label: t("gen.pages.comic.ComicWorkspacePage.gen_a1369c09"),
    desc: t("gen.pages.comic.ComicWorkspacePage.gen_2c25aa15"),
    tag: t("gen.pages.comic.ComicWorkspacePage.gen_e7c37575"),
    imageSize: "1024x1536",
    promptKeywords: "4-koma manga layout, four equal vertical panels in one image, sequential comic strip",
    layoutSvg: (
      <svg viewBox="0 0 60 90" className="w-full h-full">
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x="8" y={4 + i * 21} width="44" height="18" rx="1.5" fill="currentColor" opacity={0.18 - i * 0.02} stroke="currentColor" strokeWidth="1.5" />
        ))}
        <text x="30" y="15" textAnchor="middle" fontSize="5" fill="currentColor" opacity="0.4">{t("gen.pages.comic.ComicWorkspacePage.gen_308fdfa0")}</text>
        <text x="30" y="36" textAnchor="middle" fontSize="5" fill="currentColor" opacity="0.4">{t("gen.pages.comic.ComicWorkspacePage.gen_9407ae4d")}</text>
        <text x="30" y="57" textAnchor="middle" fontSize="5" fill="currentColor" opacity="0.4">{t("gen.pages.comic.ComicWorkspacePage.gen_1c421318")}</text>
        <text x="30" y="78" textAnchor="middle" fontSize="5" fill="currentColor" opacity="0.4">{t("gen.pages.comic.ComicWorkspacePage.gen_c5ef4ac4")}</text>
      </svg>
    ),
  },
  {
    value: "single_page",
    label: t("gen.pages.comic.ComicWorkspacePage.gen_852692e9"),
    desc: t("gen.pages.comic.ComicWorkspacePage.pageLayout"),
    tag: t("gen.pages.comic.ComicWorkspacePage.traditional"),
    imageSize: "1024x1536",
    promptKeywords: "single page manga layout, multiple panels varied sizes, dynamic panel composition, Japanese manga page",
    layoutSvg: (
      <svg viewBox="0 0 60 90" className="w-full h-full">
        <rect x="4" y="4" width="52" height="36" rx="2" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5" />
        <rect x="4" y="44" width="24" height="24" rx="2" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="1.5" />
        <rect x="32" y="44" width="24" height="24" rx="2" fill="currentColor" opacity="0.1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="4" y="72" width="16" height="14" rx="2" fill="currentColor" opacity="0.08" stroke="currentColor" strokeWidth="1.5" />
        <rect x="24" y="72" width="32" height="14" rx="2" fill="currentColor" opacity="0.1" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    value: "cinematic",
    label: t("gen.pages.comic.ComicWorkspacePage.gen_6073cdf8"),
    desc: t("gen.pages.comic.ComicWorkspacePage.gen_2a36800c"),
    tag: t("gen.pages.comic.ComicWorkspacePage.gen_62029e91"),
    imageSize: "1536x1024",
    promptKeywords: "cinematic widescreen panel, film storyboard style, letterbox 16:9 format, movie scene composition",
    layoutSvg: (
      <svg viewBox="0 0 90 60" className="w-full h-full">
        <rect x="4" y="8" width="82" height="18" rx="2" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5" />
        <rect x="4" y="30" width="38" height="18" rx="2" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="1.5" />
        <rect x="48" y="30" width="38" height="18" rx="2" fill="currentColor" opacity="0.1" stroke="currentColor" strokeWidth="1.5" />
        <line x1="4" y1="52" x2="86" y2="52" stroke="currentColor" strokeWidth="0.5" strokeDasharray="3,2" opacity="0.2" />
        <line x1="4" y1="4" x2="86" y2="4" stroke="currentColor" strokeWidth="0.5" strokeDasharray="3,2" opacity="0.2" />
      </svg>
    ),
  },
  {
    value: "chat_comic",
    label: t("gen.pages.comic.ComicWorkspacePage.gen_9d020707"),
    desc: t("gen.pages.comic.ComicWorkspacePage.gen_dc5a6d5f"),
    tag: t("gen.pages.comic.ComicWorkspacePage.gen_2247d342"),
    imageSize: "1024x1536",
    promptKeywords: "chat comic style, messenger conversation bubbles, LINE webtoon chat format, casual slice of life",
    layoutSvg: (
      <svg viewBox="0 0 60 90" className="w-full h-full">
        <rect x="4" y="6" width="52" height="22" rx="2" fill="currentColor" opacity="0.08" stroke="currentColor" strokeWidth="1" />
        <rect x="8" y="10" width="28" height="8" rx="4" fill="currentColor" opacity="0.2" />
        <rect x="8" y="22" width="20" height="4" rx="2" fill="currentColor" opacity="0.15" />
        <rect x="4" y="32" width="52" height="22" rx="2" fill="currentColor" opacity="0.08" stroke="currentColor" strokeWidth="1" />
        <rect x="24" y="36" width="28" height="8" rx="4" fill="currentColor" opacity="0.2" />
        <rect x="32" y="48" width="20" height="4" rx="2" fill="currentColor" opacity="0.15" />
        <rect x="4" y="58" width="52" height="22" rx="2" fill="currentColor" opacity="0.08" stroke="currentColor" strokeWidth="1" />
        <rect x="8" y="62" width="26" height="8" rx="4" fill="currentColor" opacity="0.2" />
        <circle cx="50" cy="66" r="5" fill="currentColor" opacity="0.15" />
      </svg>
    ),
  },
  {
    value: "chibi_comic",
    label: t("gen.pages.comic.ComicWorkspacePage.gen_Q版萌漫_amz0"),
    desc: t("gen.pages.comic.ComicWorkspacePage.gen_e3f26d8f"),
    tag: t("gen.pages.comic.ComicWorkspacePage.gen_69097442"),
    imageSize: "1024x1024",
    promptKeywords: "chibi SD manga style, cute super-deformed proportions, kawaii comic panel, round adorable characters",
    layoutSvg: (
      <svg viewBox="0 0 60 60" className="w-full h-full">
        <rect x="4" y="4" width="24" height="24" rx="2" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="1.5" />
        <rect x="32" y="4" width="24" height="24" rx="2" fill="currentColor" opacity="0.1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="4" y="32" width="24" height="24" rx="2" fill="currentColor" opacity="0.1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="32" y="32" width="24" height="24" rx="2" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="16" cy="14" r="5" fill="currentColor" opacity="0.25" />
        <circle cx="44" cy="14" r="5" fill="currentColor" opacity="0.2" />
        <circle cx="16" cy="44" r="5" fill="currentColor" opacity="0.2" />
        <circle cx="44" cy="44" r="5" fill="currentColor" opacity="0.25" />
      </svg>
    ),
  },
  {
    value: "ink_comic",
    label: t("gen.pages.comic.ComicWorkspacePage.gen_452631b4"),
    desc: t("gen.pages.comic.ComicWorkspacePage.traditionalBrushStrokeCalligraphyMoodWhitescopicAesthetic"),
    tag: t("gen.pages.comic.ComicWorkspacePage.gen_8daead55"),
    imageSize: "1024x1536",
    promptKeywords: "Chinese ink wash painting comic, traditional brush style, xieyi brushwork, classical Chinese aesthetic, negative space",
    layoutSvg: (
      <svg viewBox="0 0 60 90" className="w-full h-full">
        <rect x="4" y="4" width="52" height="40" rx="2" fill="currentColor" opacity="0.08" stroke="currentColor" strokeWidth="1" strokeDasharray="3,2" />
        <path d="M10 30 Q30 10 50 25" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.3" />
        <path d="M15 35 Q25 20 35 32" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.2" />
        <rect x="4" y="50" width="24" height="36" rx="2" fill="currentColor" opacity="0.08" stroke="currentColor" strokeWidth="1" strokeDasharray="3,2" />
        <rect x="32" y="50" width="24" height="36" rx="2" fill="currentColor" opacity="0.06" stroke="currentColor" strokeWidth="1" strokeDasharray="3,2" />
        <line x1="20" y1="54" x2="20" y2="82" stroke="currentColor" strokeWidth="0.8" opacity="0.15" />
      </svg>
    ),
  },
  {
    value: "drama_screenshot",
    label: t("gen.pages.comic.ComicWorkspacePage.gen_5c88c5f2"),
    desc: t("gen.pages.comic.ComicWorkspacePage.gen_1f8c7ce2"),
    tag: t("gen.pages.comic.ComicWorkspacePage.gen_3a27b995"),
    imageSize: "1024x1536",
    promptKeywords: "vertical short drama screenshot style, subtitle bar at bottom, TV drama still frame, cinematic vertical video",
    layoutSvg: (
      <svg viewBox="0 0 60 90" className="w-full h-full">
        <rect x="4" y="4" width="52" height="70" rx="3" fill="currentColor" opacity="0.1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="4" y="68" width="52" height="16" rx="0" fill="currentColor" opacity="0.2" />
        <line x1="10" y1="74" x2="50" y2="74" stroke="white" strokeWidth="1" opacity="0.4" />
        <line x1="14" y1="79" x2="46" y2="79" stroke="white" strokeWidth="0.8" opacity="0.3" />
        <circle cx="30" cy="32" r="10" fill="currentColor" opacity="0.15" />
        <circle cx="30" cy="32" r="5" fill="currentColor" opacity="0.2" />
      </svg>
    ),
  },
];

const WIZARD_STEPS = [
  { key: "source", label: t("gen.pages.comic.ComicWorkspacePage.gen_26ca20b1") },
  { key: "content", label: t("gen.pages.comic.ComicWorkspacePage.gen_2d711b09") },
  { key: "format", label: t("gen.pages.comic.ComicWorkspacePage.gen_9652b89c") },
  { key: "style", label: t("gen.pages.comic.ComicWorkspacePage.gen_aa1262ed") },
] as const;

function statusBadgeVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  if (status === "outlined" || status === "scripted") return "default";
  if (status === "draft") return "secondary";
  return "outline";
}
function statusLabel(s: string) {
  const m: Record<string, string> = {
    draft: t("gen.pages.comic.ComicWorkspacePage.gen_22b4334f"), outlined: t("gen.pages.comic.ComicWorkspacePage.gen_05dab7aa"), scripted: t("gen.pages.comic.ComicWorkspacePage.gen_1361ca2d"), completed: t("gen.pages.comic.ComicWorkspacePage.gen_fad5222c"),
  };
  return m[s] ?? s;
}

// ─── Project card ─────────────────────────────────────────────────────────────

function ProjectCard({
  project,
  busyId,
  onImport,
}: {
  project: ComicProject;
  busyId: string;
  onImport: (p: ComicProject) => void;
}) {
  const busy = busyId === project.id;
  return (
    <Card className="rounded-lg">
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-lg leading-6">{project.title}</CardTitle>
            <Badge variant="secondary">{SOURCE_LABELS[project.sourceType]}</Badge>
            <Badge variant={statusBadgeVariant(project.status)}>{statusLabel(project.status)}</Badge>
          </div>
          <CardDescription>
            {project._count?.episodes ?? 0} 话 · {project._count?.characters ?? 0} 角色
            {project.sourceBundle ? t("gen.pages.comic.ComicWorkspacePage.importedContentSource") : ""}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button asChild type="button" size="sm">
          <Link to={`/comic/projects/${project.id}`}>
            打开工作台
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        {!project.sourceBundle && project.sourceType === "novel_import" && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onImport(project)}
          >
            <Layers3 className="h-4 w-4" />
            导入内容源
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Wizard ───────────────────────────────────────────────────────────────────

function CreateWizard({ onCreated }: { onCreated: (id: string) => void }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    title: "",
    sourceType: "original" as ComicSourceType,
    sourceRef: "",
    inspiration: "",
    rawText: "",
    format: "webtoon",
    style: "webtoon_color",
  });

  const { data: novels } = useQuery({
    queryKey: ["novels"],
    queryFn: () => getNovelList(),
    enabled: form.sourceType === "novel_import",
  });

  const createMut = useMutation({
    mutationFn: (payload: CreateComicProjectPayload) => createComicProject(payload),
    onSuccess: (proj) => {
      toast.success(t("gen.pages.comic.ComicWorkspacePage.gen_49fbf911"));
      onCreated(proj.id);
    },
  });

  const canNext = () => {
    if (step === 0) return form.title.trim().length > 0;
    if (step === 1) {
      if (form.sourceType === "novel_import") return Boolean(form.sourceRef);
      if (form.sourceType === "original") return form.inspiration.trim().length > 0;
      if (form.sourceType === "text_import") return form.rawText.trim().length > 0;
      return true;
    }
    return true;
  };

  const handleSubmit = () => {
    const selectedFormat = COMIC_FORMATS.find((f) => f.value === form.format) ?? COMIC_FORMATS[0];
    createMut.mutate({
      title: form.title.trim(),
      sourceType: form.sourceType,
      sourceRef: form.sourceType === "novel_import" ? form.sourceRef : undefined,
      inspiration: form.sourceType === "original" ? form.inspiration.trim() : undefined,
      rawText: form.sourceType === "text_import" ? form.rawText.trim() : undefined,
      comicFormat: selectedFormat.value,
      stylePreset: JSON.stringify({ style: form.style, format: selectedFormat.value, promptKeywords: selectedFormat.promptKeywords, imageSize: selectedFormat.imageSize }),
    });
  };

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="text-base">{t("gen.pages.comic.ComicWorkspacePage.gen_3e21ebbc")}</CardTitle>
        <div className="flex gap-2 pt-1">
          {WIZARD_STEPS.map((s, i) => (
            <span
              key={s.key}
              className={`rounded px-2 py-0.5 text-xs font-medium ${i === step ? "bg-primary text-primary-foreground" : i < step ? "bg-muted text-muted-foreground line-through" : "bg-muted text-muted-foreground"}`}
            >
              {s.label}
            </span>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === 0 && (
          <>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t("gen.pages.comic.ComicWorkspacePage.gen_cac8e6ef")}</label>
              <Input
                placeholder={t("gen.pages.comic.ComicWorkspacePage.gen_82ea5545")}
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t("gen.pages.comic.ComicWorkspacePage.gen_e78b1d7a")}</label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(SOURCE_LABELS) as ComicSourceType[]).filter(t => t !== "comic_import").map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, sourceType: t }))}
                    className={`rounded-full border px-3 py-1 text-sm transition-colors ${form.sourceType === t ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted hover:bg-accent"}`}
                  >
                    {SOURCE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            {form.sourceType === "novel_import" && (
              <div className="space-y-1">
                <label className="text-sm font-medium">{t("gen.pages.comic.ComicWorkspacePage.gen_44cddc3d")}</label>
                <SelectControl
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.sourceRef}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm((f) => ({ ...f, sourceRef: e.target.value }))}
                >
                  <option value="">{t("gen.pages.comic.ComicWorkspacePage.selectNovel")}</option>
                  {novels?.data?.items?.map((n) => (
                    <option key={n.id} value={n.id}>{t("gen.pages.comic.ComicWorkspacePage.titleMissing")}</option>
                  ))}
                </SelectControl>
              </div>
            )}
            {form.sourceType === "original" && (
              <div className="space-y-1">
                <label className="text-sm font-medium">{t("gen.pages.comic.ComicWorkspacePage.gen_12e65d03")}</label>
                <textarea
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-y min-h-[120px]"
                  placeholder={t("gen.pages.comic.ComicWorkspacePage.gen_89608257")}
                  rows={6}
                  value={form.inspiration}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm((f) => ({ ...f, inspiration: e.target.value }))}
                />
              </div>
            )}
            {form.sourceType === "text_import" && (
              <div className="space-y-1">
                <label className="text-sm font-medium">{t("gen.pages.comic.ComicWorkspacePage.gen_f45ae383")}</label>
                <textarea
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-y min-h-[160px]"
                  placeholder={t("gen.pages.comic.ComicWorkspacePage.gen_7ddca43b")}
                  rows={8}
                  value={form.rawText}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm((f) => ({ ...f, rawText: e.target.value }))}
                />
              </div>
            )}
          </>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">{t("gen.pages.comic.ComicWorkspacePage.gen_66c8471a")}</label>
              <p className="text-xs text-muted-foreground mt-0.5">{t("gen.pages.comic.ComicWorkspacePage.gen_01f6a08c")}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {COMIC_FORMATS.map((fmt) => {
                const selected = form.format === fmt.value;
                return (
                  <button
                    key={fmt.value}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, format: fmt.value }))}
                    className={`relative flex flex-col rounded-lg border p-2 text-left transition-all ${selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-muted/40 hover:bg-accent"}`}
                  >
                    {fmt.tag && (
                      <span className={`absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${selected ? "bg-primary text-primary-foreground" : "bg-muted-foreground/20 text-muted-foreground"}`}>
                        {fmt.tag}
                      </span>
                    )}
                    <div className={`mb-2 flex items-center justify-center rounded ${fmt.imageSize === "1536x1024" ? "aspect-video" : "aspect-[2/3]"} w-full overflow-hidden ${selected ? "text-primary" : "text-muted-foreground"}`}>
                      {fmt.layoutSvg}
                    </div>
                    <span className={`text-xs font-semibold ${selected ? "text-primary" : ""}`}>{fmt.label}</span>
                    <span className="mt-0.5 line-clamp-2 text-[10px] leading-tight text-muted-foreground">{fmt.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("gen.pages.comic.ComicWorkspacePage.gen_e9e7f721")}</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {STYLE_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, style: p.value }))}
                  className={`rounded-lg border p-3 text-sm font-medium transition-colors ${form.style === p.value ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted hover:bg-accent"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-between pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={step === 0}
            onClick={() => setStep((s) => s - 1)}
          >
            上一步
          </Button>
          {step < WIZARD_STEPS.length - 1 ? (
            <Button
              type="button"
              size="sm"
              disabled={!canNext()}
              onClick={() => setStep((s) => s + 1)}
            >
              下一步
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={createMut.isPending || !canNext()}
              onClick={handleSubmit}
            >
              {createMut.isPending ? t("gen.pages.comic.ComicWorkspacePage.gen_d156b373") : t("gen.pages.comic.ComicWorkspacePage.gen_39da6755")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ComicWorkspacePage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showWizard, setShowWizard] = useState(false);
  const [busyId, setBusyId] = useState("");

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["comic", "projects"],
    queryFn: listComicProjects,
  });

  const importMut = useMutation({
    mutationFn: (projectId: string) => importComicSourceBundle(projectId),
    onMutate: (id) => setBusyId(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comic", "projects"] });
      toast.success(t("gen.pages.comic.ComicWorkspacePage.gen_1358c5c5"));
    },
    onSettled: () => setBusyId(""),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <SquareStack className="h-6 w-6 text-primary" />
            漫画改编工作台
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            将小说或原创故事一键生成条漫分格脚本与图像
          </p>
        </div>
        <Button type="button" onClick={() => setShowWizard((v) => !v)}>
          <Plus className="h-4 w-4" />
          新建项目
        </Button>
      </div>

      <ComicImageGenerationNotice />

      {showWizard && (
        <CreateWizard
          onCreated={(id) => {
            setShowWizard(false);
            queryClient.invalidateQueries({ queryKey: ["comic", "projects"] });
            navigate(`/comic/projects/${id}`);
          }}
        />
      )}

      {isLoading && (
        <div className="py-12 text-center text-muted-foreground text-sm">{t("gen.pages.comic.ComicWorkspacePage.gen_fb4ca1cf")}</div>
      )}

      {!isLoading && projects.length === 0 && !showWizard && (
        <Card className="py-16 text-center">
          <CardContent className="flex flex-col items-center gap-4">
            <FilePen className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-muted-foreground">{t("gen.pages.comic.ComicWorkspacePage.gen_f38af214")}</p>
            <Button type="button" onClick={() => setShowWizard(true)}>
              <Plus className="h-4 w-4" />
              新建项目
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {projects.map((proj) => (
          <ProjectCard
            key={proj.id}
            project={proj}
            busyId={busyId}
            onImport={(p) => importMut.mutate(p.id)}
          />
        ))}
      </div>
    </div>
  );
}
