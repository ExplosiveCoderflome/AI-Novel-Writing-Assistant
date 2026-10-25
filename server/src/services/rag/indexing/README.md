# Indexing checkpoints

This module owns successful embedding checkpoints, batching, job leases and
knowledge-document publication. The checkpoint store has no database or LLM
dependencies. `EmbeddingService` validates requests and saves successful batches;
`RagJobLease` fences each attempt; `KnowledgeIndexReplacement` stages vectors and
resumes cleanup. `RagIndexService` owns the local publication transaction.

Checkpoint files are separate from the vector index and contain only input hashes,
vectors and timestamps. They preserve paid results across later failures while the
publication transaction protects previously committed chunks. Document vectors
carry an index generation; retrieval filters by the generation in committed local
metadata so staged/abandoned points cannot consume the topK budget. Ordinary novel
owners retain their existing publication behavior.

See [embedding recovery rules](../../../../../docs/wiki/rag/embedding-checkpoints-and-recovery.md)
for namespaces, retention, compatibility and the limits of billing guarantees.
See [publication and lease rules](../../../../../docs/wiki/rag/knowledge-index-publication.md)
for cancellation, exact deletion scope and downgrade requirements.
