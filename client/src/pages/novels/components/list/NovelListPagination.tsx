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
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={props.page <= 1 || props.isFetching}
        onClick={() => props.onPageChange(Math.max(1, props.page - 1))}
      >
        上一页
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={props.page >= props.totalPages || props.isFetching}
        onClick={() => props.onPageChange(Math.min(props.totalPages, props.page + 1))}
      >
        下一页
      </Button>
    </div>
  );
}
