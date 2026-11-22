import { useEffect, useRef, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

interface DirectoryBranchProps {
  heading: ReactNode;
  children: ReactNode;
  reveal?: string;
}

export function DirectoryBranch({ heading, children, reveal }: DirectoryBranchProps) {
  const details = useRef<HTMLDetailsElement>(null);
  // Another chapter can become current inside a branch the reader manually closed.
  useEffect(() => {
    if (reveal && details.current) details.current.open = true;
  }, [reveal]);

  return <details ref={details} open={Boolean(reveal)}>
    <summary className="directory-summary flex min-w-0 cursor-pointer list-none items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-muted/65 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
      {heading}
      <ChevronRight aria-hidden="true" className="directory-chevron ml-auto size-3.5 shrink-0 text-muted-foreground" />
    </summary>
    {children}
  </details>;
}
