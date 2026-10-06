export interface LegacyRunRow {id: string; novelId: string | null; title: string; status: string; progress: number; lastError: string | null}
export interface LegacyRunReader {list(input: {novelId?: string; limit: number}): Promise<readonly LegacyRunRow[]>}

/** History only. No old seed, control state adoption, recovery or persistence dependency. */
export class LegacyRunProjection {
  constructor(private readonly reader: LegacyRunReader) {}
  async list(input: {novelId?: string; limit: number}) {
    return (await this.reader.list(input)).map(row => ({runId: row.id, novelId: row.novelId,
      mode: "history" as const, statusLabel: "历史记录", headline: row.title, detail: row.lastError,
      progressLabel: `历史进度 ${Math.round(row.progress*100)}%`,
      sourceRoute: row.novelId ? `/lab/director/${encodeURIComponent(row.novelId)}` : "/novels",
      directorRoute: row.novelId ? `/lab/director/${encodeURIComponent(row.novelId)}` : "/novels",
      availableActions: row.novelId ? [{id: "takeover", kind: "navigate" as const, label: "从现有内容继续创作", target: `/lab/director/${encodeURIComponent(row.novelId)}`}]: [],
    }));
  }
}
