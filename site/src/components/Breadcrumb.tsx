import { ChevronRight } from "lucide-react";
import { docsPath } from "../routing";

type BreadcrumbProps = {
  categoryTitle: string;
  docTitle: string;
};

export function Breadcrumb({ categoryTitle, docTitle }: BreadcrumbProps) {
  return (
    <nav className="breadcrumb" aria-label="文档位置">
      <a href={docsPath()}>文档</a>
      <ChevronRight size={14} />
      <span>{categoryTitle}</span>
      <ChevronRight size={14} />
      <strong>{docTitle}</strong>
    </nav>
  );
}
