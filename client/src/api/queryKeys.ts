export const queryKeys = {
  novels: {
    all: ["novels"] as const,
    list: (page: number, limit: number) => ["novels", "list", page, limit] as const,
    detail: (id: string) => ["novels", "detail", id] as const,
    chapters: (id: string) => ["novels", "chapters", id] as const,
    characters: (id: string) => ["novels", "characters", id] as const,
    characterTimeline: (id: string, charId: string) => ["novels", "character-timeline", id, charId] as const,
    chapterTraces: (novelId: string, chapterId: string) => ["novels", "chapter-traces", novelId, chapterId] as const,
    pipelineJob: (id: string, jobId: string) => ["novels", "pipeline", id, jobId] as const,
    qualityReport: (id: string) => ["novels", "quality-report", id] as const,
    storylineVersions: (id: string) => ["novels", "storyline-versions", id] as const,
  },
  worlds: {
    all: ["worlds"] as const,
    detail: (id: string) => ["worlds", "detail", id] as const,
    templates: ["worlds", "templates"] as const,
    overview: (id: string) => ["worlds", "overview", id] as const,
    visualization: (id: string) => ["worlds", "visualization", id] as const,
    snapshots: (id: string) => ["worlds", "snapshots", id] as const,
    library: (params: string) => ["worlds", "library", params] as const,
    knowledgeDocuments: (id: string) => ["worlds", "knowledge-documents", id] as const,
  },
  knowledge: {
    documents: (params: string) => ["knowledge", "documents", params] as const,
    detail: (id: string) => ["knowledge", "detail", id] as const,
    ragJobs: (params: string) => ["knowledge", "rag-jobs", params] as const,
    ragHealth: ["knowledge", "rag-health"] as const,
  },
  bookAnalysis: {
    list: (params: string) => ["book-analysis", "list", params] as const,
    detail: (id: string) => ["book-analysis", "detail", id] as const,
  },
  writingFormula: {
    all: ["writing-formula"] as const,
    detail: (id: string) => ["writing-formula", "detail", id] as const,
  },
  baseCharacters: {
    all: ["base-characters"] as const,
    detail: (id: string) => ["base-characters", "detail", id] as const,
  },
  llm: {
    providers: ["llm", "providers"] as const,
  },
  images: {
    task: (taskId: string) => ["images", "task", taskId] as const,
    assets: (sceneType: "character", sceneId: string) => ["images", "assets", sceneType, sceneId] as const,
  },
  tasks: {
    list: (params: string) => ["tasks", "list", params] as const,
    detail: (kind: string, id: string) => ["tasks", "detail", kind, id] as const,
  },
  agentRuns: {
    list: (params: string) => ["agent-runs", "list", params] as const,
    detail: (id: string) => ["agent-runs", "detail", id] as const,
  },
  settings: {
    apiKeys: ["settings", "api-keys"] as const,
    rag: ["settings", "rag"] as const,
  },
  novelsKnowledge: {
    bindings: (id: string) => ["novels", "knowledge-documents", id] as const,
  },
};
