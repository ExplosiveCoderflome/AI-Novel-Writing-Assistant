import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { Github } from "lucide-react";
import { cn } from "@/lib/utils";

const PROJECT_GITHUB_URL = "https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant";
const PROJECT_GITHUB_LABEL = "AI-Novel-Writing-Assistant";

interface ProjectGithubLinkProps {
  className?: string;
}

export default function ProjectGithubLink({ className }: ProjectGithubLinkProps) {
  return (
    <a
      href={PROJECT_GITHUB_URL}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-md px-1 text-[11px] leading-none text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      title={t("gen.components.layout.ProjectGithubLink.gen_8f9e4b3e")}
      aria-label={t("gen.components.layout.ProjectGithubLink.gen_8f9e4b3e")}
    >
      <Github className="h-3.5 w-3.5" />
      <span className="hidden whitespace-nowrap sm:inline">{PROJECT_GITHUB_LABEL}</span>
    </a>
  );
}
