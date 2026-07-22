import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
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
    <nav className="flex flex-wrap items-center justify-end gap-2" aria-label={t("gen.pages.novels.components.list.NovelListPagination.gen_5ecc53d5")}>
      <Button
        type="button"
        variant="outline"
        disabled={props.page <= 1 || props.isFetching}
        onClick={() => props.onPageChange(Math.max(1, props.page - 1))}
      >
        上一页
      </Button>
      <div
        className="flex h-9 min-w-28 items-center justify-center px-3 text-sm text-muted-foreground"
        aria-live="polite"
      >
        第 <span className="mx-1 font-medium tabular-nums text-foreground">{props.page}</span> /{" "}
        <span className="mx-1 font-medium tabular-nums text-foreground">{props.totalPages}</span> 页
      </div>
      <Button
        type="button"
        variant="outline"
        disabled={props.page >= props.totalPages || props.isFetching}
        onClick={() => props.onPageChange(Math.min(props.totalPages, props.page + 1))}
      >
        下一页
      </Button>
    </nav>
  );
}
