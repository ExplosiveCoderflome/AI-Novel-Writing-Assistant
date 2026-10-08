/** One in-flight asset read per book; a later save requires a fresh read after the old one completes. */
export function createWorkspaceRefresh(refresh: () => Promise<unknown>) {
  let active = true;
  let latest: string | null = null;
  let loaded: string | null = null;
  let loading = false;
  function load(revision: string) {
    loading = true;
    void (async () => {
      try { await refresh(); loaded = revision; }
      catch { /* The page shows the query error; the next status poll retries. */ }
      finally {
        loading = false;
        if (active && latest && latest !== revision && latest !== loaded) load(latest);
      }
    })();
  }
  return {
    observe(revision: string) {
      if (!active) return;
      latest = revision;
      if (!loading && loaded !== revision) load(revision);
    },
    dispose() { active = false; },
  };
}
