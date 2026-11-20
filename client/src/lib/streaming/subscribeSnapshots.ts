type Source = Pick<EventSource, "onmessage" | "onopen" | "onerror" | "close">;
export type SnapshotSourceFactory = (url: string) => Source;

/** A disconnected subscriber can reopen the same URL and receive the latest snapshot. */
export function subscribeSnapshots(url: string, onValue: (value: unknown) => void,
  onConnection?: (connected: boolean) => void,
  createSource: SnapshotSourceFactory = address => new EventSource(address, {withCredentials: true})) {
  let active = true;
  const source = createSource(url);
  source.onopen = () => { if (active) onConnection?.(true); };
  source.onerror = () => { if (active) onConnection?.(false); };
  source.onmessage = event => {
    if (!active) return;
    let value: unknown;
    try { value = JSON.parse(event.data); } catch { return; }
    onValue(value);
  };
  return () => { active = false; source.close(); };
}
