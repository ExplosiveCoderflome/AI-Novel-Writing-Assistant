export function candidateAnchor(batchId: string, candidateId: string) {
  return `opening-candidate/${encodeURIComponent(batchId)}/${encodeURIComponent(candidateId)}`;
}
