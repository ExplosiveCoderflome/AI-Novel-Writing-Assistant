/** Allocate the context budget to the most recent completed exchanges. Rows are in chronological order. */
export function recentAgentDiscussion(rows: readonly { status: string; requestText: string; replyText: string | null }[],
  budget = 12000) {
  const history: { author: string; assistant: string | null }[] = [];
  for (let i = rows.length - 1; i >= 0 && budget > 0; i--) {
    const row = rows[i];
    if (row.status !== "completed") continue;
    const author = row.requestText.slice(0, budget);
    const assistant = row.replyText?.slice(0, budget - author.length) ?? null;
    history.push({ author, assistant });
    budget -= author.length + (assistant?.length ?? 0);
  }
  return history.reverse();
}
