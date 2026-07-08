import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPromptCatalog } from "@/api/promptWorkbench";
import { queryKeys } from "@/api/queryKeys";

export function usePromptCatalog(keyword: string) {
  const normalizedKeyword = keyword.trim();
  const catalogParamsKey = useMemo(
    () => JSON.stringify({ keyword: normalizedKeyword }),
    [normalizedKeyword],
  );

  const catalogQuery = useQuery({
    queryKey: queryKeys.promptWorkbench.catalog(catalogParamsKey),
    queryFn: () => getPromptCatalog(normalizedKeyword ? { keyword: normalizedKeyword } : {}),
    staleTime: 30_000,
  });

  return {
    query: catalogQuery,
    prompts: catalogQuery.data?.data ?? [],
    refetch: catalogQuery.refetch,
  };
}
