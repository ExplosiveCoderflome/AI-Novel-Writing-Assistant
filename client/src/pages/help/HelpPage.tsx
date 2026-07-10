import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import {
  BookOpenText,
  CheckCircle2,
  CircleHelp,
  ClipboardList,
  Compass,
  KeyRound,
  ListTodo,
  Route,
  Sparkles,
  WandSparkles,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const DIRECTOR_CREATE_LINK = "/novels/auto-director";

interface GuideStep {
  title: string;
  description: string;
  icon: LucideIcon;
}

interface GoalEntry {
  title: string;
  description: string;
  href: string;
  action: string;
  icon: LucideIcon;
}

interface FaqItem {
  question: string;
  answer: string;
}

const guideSteps: GuideStep[] = [
  {
    title: t("gen.pages.help.HelpPage.gen_6fba737c"),
    description: t("gen.pages.help.HelpPage.gen_4a0d6965"),
    icon: KeyRound,
  },
  {
    title: t("gen.pages.help.HelpPage.gen_3a580d54"),
    description: t("gen.pages.help.HelpPage.gen_e452f839"),
    icon: Sparkles,
  },
  {
    title: t("gen.pages.help.HelpPage.gen_facd1956"),
    description: t("gen.pages.help.HelpPage.gen_dc0db31b"),
    icon: Compass,
  },
  {
    title: t("gen.pages.help.HelpPage.gen_b4685041"),
    description: t("gen.pages.help.HelpPage.chooseBestFromOptions"),
    icon: CheckCircle2,
  },
  {
    title: t("gen.pages.help.HelpPage.gen_0736c320"),
    description: t("gen.pages.help.HelpPage.gen_63f771a6"),
    icon: Workflow,
  },
  {
    title: t("gen.pages.help.HelpPage.gen_98b5f8b5"),
    description: t("gen.pages.help.HelpPage.gen_83e7392a"),
    icon: BookOpenText,
  },
  {
    title: t("gen.pages.help.HelpPage.gen_82e583aa"),
    description: t("gen.pages.help.HelpPage.taskCenterProcessingFailQueueRunStatusDirectorFollowupPage"),
    icon: ListTodo,
  },
];

const goalEntries: GoalEntry[] = [
  {
    title: t("gen.pages.help.HelpPage.openBookFromZero"),
    description: t("gen.pages.help.HelpPage.gen_d2af9065"),
    href: DIRECTOR_CREATE_LINK,
    action: t("gen.pages.help.HelpPage.gen_de6465aa"),
    icon: Sparkles,
  },
  {
    title: t("gen.pages.help.HelpPage.gen_155cbfb0"),
    description: t("gen.pages.help.HelpPage.gen_e0052608"),
    href: "/novels",
    action: t("gen.pages.help.HelpPage.gen_26c6b1d1"),
    icon: BookOpenText,
  },
  {
    title: t("gen.pages.help.HelpPage.gen_1efc6243"),
    description: t("gen.pages.help.HelpPage.gen_a0789d6d"),
    href: "/settings",
    action: t("gen.pages.help.HelpPage.gen_6dd1b030"),
    icon: Route,
  },
  {
    title: t("gen.pages.help.HelpPage.gen_cc933199"),
    description: t("gen.pages.help.HelpPage.gen_fd1dfe41"),
    href: "/tasks",
    action: t("gen.pages.help.HelpPage.gen_14b9b603"),
    icon: ClipboardList,
  },
  {
    title: t("gen.pages.help.HelpPage.gen_ad254401"),
    description: t("gen.pages.help.HelpPage.gen_a22cab60"),
    href: "/auto-director/follow-ups",
    action: t("gen.pages.help.HelpPage.gen_5bb4c08b"),
    icon: Workflow,
  },
  {
    title: t("gen.pages.help.HelpPage.gen_57a7c4aa"),
    description: t("gen.pages.help.HelpPage.gen_32707bab"),
    href: "/style-engine",
    action: t("gen.pages.help.HelpPage.gen_ea734007"),
    icon: WandSparkles,
  },
];

const faqItems: FaqItem[] = [
  {
    question: t("gen.pages.help.HelpPage.gen_db71b67f"),
    answer: t("gen.pages.help.HelpPage.noNeed"),
  },
  {
    question: t("gen.pages.help.HelpPage.gen_55df6a8a"),
    answer: t("gen.pages.help.HelpPage.notRequired"),
  },
  {
    question: t("gen.pages.help.HelpPage.howToDoOnErrorTask"),
    answer: t("gen.pages.help.HelpPage.gen_109c8908"),
  },
  {
    question: t("gen.pages.help.HelpPage.gen_81a914a6"),
    answer: t("gen.pages.help.HelpPage.gen_3f0e875f"),
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <section className="rounded-xl border bg-gradient-to-br from-primary/10 via-background to-emerald-500/10 p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{t("gen.pages.help.HelpPage.gen_c46d213c")}</Badge>
              <Badge variant="outline">{t("gen.pages.help.HelpPage.gen_b97e1eec")}</Badge>
            </div>
            <h1 className="text-3xl font-semibold tracking-normal text-foreground sm:text-4xl">
              从一句灵感开始，让 AI 带你写第一本小说
            </h1>
            <p className="text-sm leading-6 text-muted-foreground sm:text-base">
              按这条路线走，不需要先会写大纲、角色表或卷规划。你只负责提供想法和做关键选择，AI 会把整本书拆成能继续推进的步骤。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="lg">
              <Link to={DIRECTOR_CREATE_LINK}>{t("gen.pages.help.HelpPage.gen_de6465aa")}</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/settings">{t("gen.pages.help.HelpPage.gen_6fba737c")}</Link>
            </Button>
          </div>
        </div>
      </section>

      <Card className="border-amber-300 bg-amber-50/80">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <KeyRound className="h-5 w-5 text-amber-700" />
            <CardTitle className="text-lg text-amber-950">{t("gen.pages.help.HelpPage.gen_37eabb8d")}</CardTitle>
          </div>
          <CardDescription className="text-amber-900/80">
            自动导演、正文写作和章节审阅都需要可用模型。先完成模型厂商、API Key 和默认模型配置，再启动开书流程会更顺畅。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link to="/settings">{t("gen.pages.help.HelpPage.gen_fc27aba2")}</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("gen.pages.help.HelpPage.gen_b97e1eec")}</CardTitle>
          <CardDescription>{t("gen.pages.help.HelpPage.gen_464bf605")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {guideSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="rounded-lg border bg-background p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{index + 1}</Badge>
                        <div className="font-semibold">{step.title}</div>
                      </div>
                      <p className="text-sm leading-6 text-muted-foreground">{step.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("gen.pages.help.HelpPage.gen_51948d98")}</CardTitle>
          <CardDescription>{t("gen.pages.help.HelpPage.noUnderstandAll")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {goalEntries.map((entry) => {
              const Icon = entry.icon;
              return (
                <div key={entry.title} className="flex flex-col justify-between gap-4 rounded-lg border bg-background p-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="font-semibold">{entry.title}</div>
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground">{entry.description}</p>
                  </div>
                  <Button asChild variant="outline" className="w-full justify-center">
                    <Link to={entry.href}>{entry.action}</Link>
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CircleHelp className="h-5 w-5 text-primary" />
            <CardTitle>{t("gen.pages.help.HelpPage.gen_50d52dd9")}</CardTitle>
          </div>
          <CardDescription>{t("gen.pages.help.HelpPage.gen_eed4c553")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            {faqItems.map((item) => (
              <div key={item.question} className="rounded-lg border bg-background p-4">
                <div className="font-semibold">{item.question}</div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.answer}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
