import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";

const PROJECT_HOMEPAGE_URL = "https://biznovelstudio.com";
const PROJECT_HOMEPAGE_LABEL = "项目首页";

interface ProjectHomepageLinkProps {
  className?: string;
}

export default function ProjectHomepageLink({ className }: ProjectHomepageLinkProps) {
  return (
    <a
      href={PROJECT_HOMEPAGE_URL}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-md px-1 text-[11px] leading-none text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      title="打开项目首页"
      aria-label="打开项目首页"
    >
      <Globe className="h-3.5 w-3.5" />
      <span className="hidden whitespace-nowrap sm:inline">{PROJECT_HOMEPAGE_LABEL}</span>
    </a>
  );
}
