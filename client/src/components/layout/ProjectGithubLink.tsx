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
      title="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
      aria-label="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
    >
      <Github className="h-3.5 w-3.5" />
      <span className="hidden whitespace-nowrap sm:inline">{PROJECT_GITHUB_LABEL}</span>
    </a>
  );
}
