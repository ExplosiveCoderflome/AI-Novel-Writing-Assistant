import { Button } from "@/components/ui/button";

export function NovelListPagination(props: {
  page: number;
  totalPages: number;
  isFetching: boolean;
  onPageChange: (page: number) => void;
}) {
  if (props.totalPages <= 1) {
    return null;
  }
  return (
    <nav className="flex flex-wrap items-center justify-end gap-2" aria-label="Novel list pagination">
      <Button
        type="button"
        variant="outline"
        disabled={props.page <= 1 || props.isFetching}
        onClick={() => props.onPageChange(Math.max(1, props.page - 1))}
      >
        Previous page
                    </Button>
      <div
        className="flex h-9 min-w-28 items-center justify-center px-3 text-sm text-muted-foreground"
        aria-live="polite"
      >
        Section <span className="mx-1 font-medium tabular-nums text-foreground">{props.page}</span> /{" "}
        <span className="mx-1 font-medium tabular-nums text-foreground">{props.totalPages}</span> Page
                    </div>
      <Button
        type="button"
        variant="outline"
        disabled={props.page >= props.totalPages || props.isFetching}
        onClick={() => props.onPageChange(Math.min(props.totalPages, props.page + 1))}
      >
        Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.
                    </Button>
    </nav>
  );
}
