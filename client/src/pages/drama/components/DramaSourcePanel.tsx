import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  analyzeDramaSourceSupplement,
  type DramaProjectDetail,
  type DramaSourceSupplementGuidance,
} from "@/api/drama";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";

function safeJson<T>(input: string | null | undefined, fallback: T): T {
  if (!input) {
    return fallback;
  }
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}

function compactText(input: unknown): string {
  if (typeof input === "string") {
    return input;
  }
  if (input == null) {
    return "";
  }
  return JSON.stringify(input, null, 2);
}

function SourceQualityChecklist(props: {
  synopsisReady: boolean;
  beatCount: number;
  characterCount: number;
  factCount: number;
}) {
  const checks = [
    {
      label: t("gen.pages.drama.components.DramaSourcePanel.gen_cd0f1be8"),
      ready: props.synopsisReady,
      detail: props.synopsisReady ? t("gen.pages.drama.components.DramaSourcePanel.gen_19ae8eaf") : t("gen.pages.drama.components.DramaSourcePanel.gen_d1065368"),
    },
    {
      label: t("gen.pages.drama.components.DramaSourcePanel.gen_154ed707"),
      ready: props.beatCount >= 8,
      detail: props.beatCount >= 8 ? `${props.beatCount} 个节拍` : `${props.beatCount} 个节拍，可能不足以支撑长集数`,
    },
    {
      label: t("gen.pages.drama.components.DramaSourcePanel.gen_f200b8db"),
      ready: props.characterCount >= 2,
      detail: props.characterCount >= 2 ? `${props.characterCount} 个角色` : t("gen.pages.drama.components.DramaSourcePanel.majorRoleInsufficient"),
    },
    {
      label: t("gen.pages.drama.components.DramaSourcePanel.gen_ebba644f"),
      ready: props.factCount > 0,
      detail: props.factCount > 0 ? `${props.factCount} 条硬事实` : t("gen.pages.drama.components.DramaSourcePanel.gen_285382be"),
    },
  ];

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle className="text-lg">{t("gen.pages.drama.components.DramaSourcePanel.gen_2edbdee6")}</CardTitle>
        <CardDescription>{t("gen.pages.drama.components.DramaSourcePanel.gen_a9006534")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        {checks.map((check) => (
          <div key={check.label} className="rounded-md border p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{check.label}</span>
              <Badge variant={check.ready ? "default" : "secondary"}>{t("gen.pages.drama.components.DramaSourcePanel.checkStatus")}</Badge>
            </div>
            <div className="mt-1 text-muted-foreground">{check.detail}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function readinessLabel(readiness: DramaSourceSupplementGuidance["readiness"]): string {
  const labels: Record<DramaSourceSupplementGuidance["readiness"], string> = {
    ready: t("gen.pages.drama.components.DramaSourcePanel.gen_4281b2b4"),
    needs_supplement: t("gen.pages.drama.components.DramaSourcePanel.gen_be536bcc"),
    needs_rebuild: t("gen.pages.drama.components.DramaSourcePanel.gen_e675f215"),
  };
  return labels[readiness];
}

function nextActionLabel(nextAction: DramaSourceSupplementGuidance["nextAction"]): string {
  const labels: Record<DramaSourceSupplementGuidance["nextAction"], string> = {
    continue: t("gen.pages.drama.components.DramaSourcePanel.gen_fcc6be3b"),
    supplement_notes: t("gen.pages.drama.components.DramaSourcePanel.gen_db0b4f1e"),
    rebuild_source_bundle: t("gen.pages.drama.components.DramaSourcePanel.gen_2253b438"),
  };
  return labels[nextAction];
}

function SourceSupplementPanel({ project }: { project: DramaProjectDetail }) {
  const [userSupplement, setUserSupplement] = useState("");
  const [guidance, setGuidance] = useState<DramaSourceSupplementGuidance | null>(null);
  const mutation = useMutation({
    mutationFn: () => analyzeDramaSourceSupplement(project.id, {
      userSupplement: userSupplement.trim() || undefined,
    }),
    onSuccess: (response) => {
      if (response.data) {
        setGuidance(response.data);
        toast.success(t("gen.pages.drama.components.DramaSourcePanel.gen_f06b9b58"));
      }
    },
  });

  return (
    <Card className="rounded-lg">
      <CardHeader className="gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <CardTitle className="text-lg">{t("gen.pages.drama.components.DramaSourcePanel.gen_53504bbd")}</CardTitle>
          <CardDescription>{t("gen.pages.drama.components.DramaSourcePanel.gen_5700cf46")}</CardDescription>
        </div>
        <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? t("gen.pages.drama.components.DramaSourcePanel.gen_ee0b2c88") : t("gen.pages.drama.components.DramaSourcePanel.gen_9797008e")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">{t("gen.pages.drama.components.DramaSourcePanel.gen_fdeb5225")}</span>
          <textarea
            className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={userSupplement}
            placeholder={t("gen.pages.drama.components.DramaSourcePanel.exampleMainRetainVengeanceWomenLoveTangEvilNotCliched")}
            onChange={(event) => setUserSupplement(event.target.value)}
          />
        </label>
        {guidance ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={guidance.readiness === "ready" ? "default" : "secondary"}>
                {readinessLabel(guidance.readiness)}
              </Badge>
              <Badge variant="outline">{nextActionLabel(guidance.nextAction)}</Badge>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">{guidance.summary}</p>
            {guidance.missingItems.length > 0 ? (
              <div className="grid gap-2 md:grid-cols-2">
                {guidance.missingItems.map((item, index) => (
                  <div key={`${item.area}-${index}`} className="rounded-md border p-3 text-sm">
                    <div className="font-medium">{item.problem}</div>
                    <div className="mt-1 text-muted-foreground">{item.impact}</div>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="space-y-2">
              {guidance.questions.map((question, index) => (
                <div key={`${question.priority}-${index}`} className="rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{question.priority}</Badge>
                    <span className="font-medium">{question.question}</span>
                  </div>
                  <div className="mt-1 text-muted-foreground">{question.guidance}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function DramaSourcePanel({ project }: { project: DramaProjectDetail }) {
  const bundle = project.sourceBundle;
  const beats = safeJson<Array<Record<string, unknown>>>(bundle?.beats, []);
  const facts = safeJson<Array<{ text?: string; category?: string }>>(bundle?.hardFacts, []);
  const characters = project.characters ?? [];

  if (!bundle) {
    return (
      <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
        还没有整理来源素材。先点击“整理素材”，系统会把小说、灵感或导入文本整理成短剧可用的梗概、节拍、角色和硬事实。
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SourceQualityChecklist
        synopsisReady={Boolean(bundle.synopsis?.trim())}
        beatCount={beats.length}
        characterCount={characters.length}
        factCount={facts.length}
      />
      <SourceSupplementPanel project={project} />
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-lg">{t("gen.pages.drama.components.DramaSourcePanel.gen_7b66ea72")}</CardTitle>
            <CardDescription>{t("gen.pages.drama.components.DramaSourcePanel.gen_01323675")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <section className="space-y-2">
              <h3 className="text-sm font-medium">{t("gen.pages.drama.components.DramaSourcePanel.gen_8efef589")}</h3>
              <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{t("gen.pages.drama.components.DramaSourcePanel.bundleSynopsis")}</p>
            </section>
            <section className="space-y-2">
              <h3 className="text-sm font-medium">{t("gen.pages.drama.components.DramaSourcePanel.gen_56b3529a")}</h3>
              <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{t("gen.pages.drama.components.DramaSourcePanel.bundleWorldNotes")}</p>
            </section>
          </CardContent>
        </Card>
        <div className="space-y-4">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="text-lg">{t("gen.pages.drama.components.DramaSourcePanel.gen_154ed707")}</CardTitle>
            </CardHeader>
            <CardContent className="max-h-[360px] space-y-2 overflow-auto">
              {beats.length > 0 ? beats.slice(0, 24).map((beat, index) => (
                <div key={index} className="rounded-md border p-3 text-sm">
                  <div className="font-medium">{compactText(beat.title || beat.summary || `节拍 ${index + 1}`)}</div>
                  <div className="mt-1 text-muted-foreground">{compactText(beat.summary || beat.description || beat)}</div>
                </div>
              )) : <div className="text-sm text-muted-foreground">{t("gen.pages.drama.components.DramaSourcePanel.gen_73a9c79e")}</div>}
            </CardContent>
          </Card>
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="text-lg">{t("gen.pages.drama.components.DramaSourcePanel.gen_ebba644f")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {facts.length > 0 ? facts.slice(0, 12).map((fact, index) => (
                <div key={index} className="rounded-md border px-3 py-2 text-sm">
                  {fact.text || compactText(fact)}
                </div>
              )) : <div className="text-sm text-muted-foreground">{t("gen.pages.drama.components.DramaSourcePanel.gen_470296d0")}</div>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
