import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { WorldPropertyOption } from "@ai-novel/shared/types/worldWizard";
import { flattenGenreTreeOptions, getGenreTree } from "@/api/genre";
import { getWorldTemplates } from "@/api/world";
import { queryKeys } from "@/api/queryKeys";
import type { GeneratorGenreOption, InspirationMode, WorldGeneratorTemplateOption } from "./worldGeneratorShared";
import { parseReferenceControlText } from "./worldGeneratorShared";

interface UseWorldGeneratorDerivedStateInput {
  selectedGenreId: string;
  inspirationMode: InspirationMode;
  selectedKnowledgeDocumentIds: string[];
  preserveText: string;
  allowedChangesText: string;
  forbiddenText: string;
  selectedTemplateKey: string;
  propertyOptions: WorldPropertyOption[];
}

export function useWorldGeneratorDerivedState(input: UseWorldGeneratorDerivedStateInput) {
  const templateQuery = useQuery({
    queryKey: queryKeys.worlds.templates,
    queryFn: getWorldTemplates,
  });
  const genreTreeQuery = useQuery({
    queryKey: queryKeys.genres.all,
    queryFn: getGenreTree,
  });

  const templates = (templateQuery.data?.data ?? []) as WorldGeneratorTemplateOption[];
  const genreTree = genreTreeQuery.data?.data ?? [];
  const genreOptions = useMemo(
    () => flattenGenreTreeOptions(genreTree) as GeneratorGenreOption[],
    [genreTree],
  );
  const selectedGenre = useMemo(
    () => genreOptions.find((item) => item.id === input.selectedGenreId) ?? null,
    [genreOptions, input.selectedGenreId],
  );
  const isReferenceMode = input.inspirationMode === "reference";
  const effectiveKnowledgeDocumentIds = isReferenceMode ? input.selectedKnowledgeDocumentIds : [];
  const preserveElements = useMemo(() => parseReferenceControlText(input.preserveText), [input.preserveText]);
  const allowedChanges = useMemo(() => parseReferenceControlText(input.allowedChangesText), [input.allowedChangesText]);
  const forbiddenElements = useMemo(() => parseReferenceControlText(input.forbiddenText), [input.forbiddenText]);
  const selectedGenrePathSegments = useMemo(
    () =>
      (selectedGenre?.path ?? "")
        .split("/")
        .map((item) => item.trim())
        .filter(Boolean),
    [selectedGenre],
  );
  const matchedTemplateWorldType = useMemo(() => {
    if (selectedGenrePathSegments.length === 0) {
      return "";
    }
    const matchedTemplate = templates.find((template) =>
      selectedGenrePathSegments.includes(template.worldType.trim()),
    );
    return matchedTemplate?.worldType ?? selectedGenrePathSegments[selectedGenrePathSegments.length - 1] ?? "";
  }, [selectedGenrePathSegments, templates]);
  const worldTypeAnalysisHint = useMemo(() => {
    if (!selectedGenre) {
      return "";
    }
    return [
      `主类型：${selectedGenre.name}`,
      `类型路径：${selectedGenre.path}`,
      selectedGenre.description?.trim() ? `类型说明：${selectedGenre.description.trim()}` : "",
      selectedGenre.template?.trim() ? `类型模板：${selectedGenre.template.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }, [selectedGenre]);
  const filteredTemplates = useMemo(() => {
    if (!matchedTemplateWorldType) {
      return templates;
    }
    const matched = templates.filter(
      (template) => template.worldType === matchedTemplateWorldType || template.key === "custom",
    );
    return matched.length > 0 ? matched : templates;
  }, [matchedTemplateWorldType, templates]);
  const templateSelectValue = useMemo(() => {
    if (filteredTemplates.some((item) => item.key === input.selectedTemplateKey)) {
      return input.selectedTemplateKey;
    }
    return filteredTemplates[0]?.key ?? "custom";
  }, [filteredTemplates, input.selectedTemplateKey]);
  const selectedTemplate = useMemo(
    () =>
      filteredTemplates.find((item) => item.key === templateSelectValue)
      ?? templates.find((item) => item.key === templateSelectValue),
    [filteredTemplates, templateSelectValue, templates],
  );
  const existingPropertyOptionIds = useMemo(
    () => input.propertyOptions.map((item) => item.id),
    [input.propertyOptions],
  );

  return {
    templateQuery,
    genreTreeQuery,
    templates,
    genreOptions,
    selectedGenre,
    isReferenceMode,
    effectiveKnowledgeDocumentIds,
    preserveElements,
    allowedChanges,
    forbiddenElements,
    matchedTemplateWorldType,
    worldTypeAnalysisHint,
    filteredTemplates,
    templateSelectValue,
    selectedTemplate,
    existingPropertyOptionIds,
  };
}
