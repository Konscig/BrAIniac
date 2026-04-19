# Real RAG Agent Backend Plan (2026-04-19)

## Purpose
This document fixes the target architecture for the first real RAG agent backend in BrAIniac.

The goal is not "a backend specialized only for RAG products".
The goal is "a general agent-building backend that can support a real RAG agent without polluting the core domain model".

## Architecture Corrections
- `AgentCall` must not receive callable tools from `agent.allowedToolIds`, `agent.allowedToolNames`, or `agent.tools`.
- `AgentCall` may orchestrate tools internally, but the tool set available to it must come only through graph edges.
- We must not introduce RAG-only database entities into the core service schema.
- We must not solve RAG persistence by adding tables such as `DatasetDocument`, `DatasetChunk`, or `DatasetVector`.
- RAG knowledge artifacts must be stored in a schema-free way.

## Target Shape
- Ingest/indexing remains a pipeline.
- Query-time remains an agent.
- Tool availability for the agent is edge-only.
- Knowledge artifacts are stored as JSON artifacts and/or external blobs referenced by JSON manifests.

```text
Ingest side
DatasetInput -> DocumentLoader -> Chunker -> Embedder -> VectorUpsert
                                           |
                                           v
                             artifact manifest / blob storage

Query side
ManualInput -> upstream tool-ref/tool-artifact nodes -> AgentCall
                                                   |
                                                   +--> QueryBuilder
                                                   +--> HybridRetriever
                                                   +--> ContextAssembler
                                                   +--> LLMAnswer / LLMCall
                                                   +--> CitationFormatter
                                                   +--> repeat / stop
```

## Non-Negotiable Constraints
1. `AgentCall` is edge-only for tool access.
2. The product schema stays general-purpose.
3. RAG artifacts must fit into existing generic persistence surfaces first.
4. If artifacts become too large for DB JSON fields, they move to blob/object storage, not to new core RAG tables.

## Canonical Edge Tool Artifacts
Phase 1 standardizes explicit edge contracts for agent-callable tools.

Accepted baseline shapes:
- single ref:
```json
{
  "kind": "tool_ref",
  "tool_name": "HybridRetriever",
  "tool_id": 7,
  "desc": "Retrieve top-k candidates"
}
```
- collection:
```json
{
  "kind": "tool_refs",
  "tool_refs": [
    { "kind": "tool_ref", "tool_name": "QueryBuilder" },
    { "kind": "tool_ref", "tool_name": "HybridRetriever" }
  ]
}
```

Compatibility note:
- direct `tool_node` outputs connected by edges remain acceptable as explicit callable tool artifacts.
- arbitrary payloads that merely contain `tool_name`-like fields should not be treated as callable tools.

## What "Ready" Means
A first real RAG agent is considered ready when all of the following are true:
- `AgentCall` chooses which RAG tools to call and in what order.
- The tools available to `AgentCall` come only from upstream graph-connected artifacts.
- `DocumentLoader` loads real document content from a schema-free source, not only synthetic URI normalization.
- `Chunker`, `Embedder`, `VectorUpsert`, and `HybridRetriever` operate on persisted artifacts, not only inline `input_json`.
- Strict e2e can run without inline `documents`, `chunks`, `vectors`, `candidates`, `context_bundle`, or final `answer`.
- Execution state is safe in multi-worker deployment.

## Storage Strategy Without New Tables
Preferred order:
1. Store small and medium artifacts in existing JSON fields such as node `output_json` and pipeline/report manifests.
2. For larger artifacts, store only a JSON manifest/pointer in DB and place the payload in blob/object storage.
3. Keep the format generic: artifact type, producer node, execution id, pointer, checksums, token counts, and metadata.

Recommended artifact model:
- `artifact_kind`: `documents`, `chunks`, `vectors`, `retrieval_candidates`, `context_bundle`
- `owner_scope`: pipeline id, node id, execution id, dataset id when relevant
- `storage_mode`: `inline-json` or `external-blob`
- `pointer`: null for inline artifacts, URL/key/path for external artifacts
- `meta`: token counts, model ids, chunking params, timestamps, provenance

Current implementation status:
- inline manifests are already wired into contract outputs for `documents`, `chunks`, `vectors`, `retrieval_candidates`, and `context_bundle`
- downstream contracts can already consume those inline manifests on the baseline path
- oversized manifests can now be externalized into `external-blob` local-file payloads through the pipeline artifact store
- manifest consumers can already reload `external-blob` payloads through `local-file` pointers

## Main Gaps
1. Tool access model is not aligned yet.
- We need an edge-based way to advertise callable tools to `AgentCall` without hidden agent-config catalogs.

2. Knowledge persistence is not aligned yet.
- We need schema-free artifact storage and manifest conventions.

3. Real ingest path is missing.
- `DocumentLoader` still needs a real source of document text that does not depend on new DB entities.

4. Real vector path is only partially aligned.
- `VectorUpsert` and `HybridRetriever` now have a local artifact-backed baseline, but not a production-grade backend boundary.

5. Runtime hardening is still missing.
- Execution state is still process-local.

## Recommended Implementation Order
### Phase 1. Edge-Only Agent Tool Access
- Remove agent-configured tool catalogs from `AgentCall`.
- Define the edge-level mechanism that advertises tools to `AgentCall`.
- Update e2e so that tool availability is proven by edges, not by node-local agent config.

Current implementation status:
- `AgentCall` resolves callable tools from explicit `tool_ref` / `tool_refs` edge artifacts.
- `AgentCall` also accepts direct `tool_node` outputs as explicit edge-provided callable tools.

Exit condition:
- `AgentCall` can run only with edge-provided tool refs/artifacts.

### Phase 2. Schema-Free Artifact Layer
- Define artifact manifests for `documents`, `chunks`, `vectors`, `candidates`, and `context`.
- Reuse existing JSON persistence surfaces where possible.
- Add blob/object storage pointers for oversized artifacts.

Current implementation status:
- generic inline manifests are already in place for `documents`, `chunks`, `vectors`, `retrieval_candidates`, and `context_bundle`
- the executor can externalize oversized manifests into `.artifacts/.../*.json` and keep only a pointer manifest in runtime state
- contract consumers can reload `external-blob` manifests when `pointer.kind = local-file`
- retrieval candidates and context bundles now also have manifest treatment on the contract path

Exit condition:
- The backend can persist and reload RAG artifacts without new RAG-specific tables.

### Phase 3. Real DocumentLoader
- Implement `DocumentLoader` over schema-free storage and/or dataset URI adapters.
- Allow `DocumentLoader` to produce a manifest plus loaded document content.

Current implementation status:
- `DocumentLoader` already supports a first real local-source path:
  - `workspace://...`
  - `file://...`
  - plain local paths resolved under the configured workspace root
- `.json` document bundles and plain text files are supported on that path
- unsupported URIs still fall back to synthetic contract behavior

Exit condition:
- `DocumentLoader` can load real text for downstream chunking without inline `documents`.

### Phase 4. Real Artifact-Backed Chunk/Vector Flow
- Make `Chunker` read/write artifact manifests.
- Keep `Embedder` on the existing real embedding path when possible.
- Make `VectorUpsert` persist vectors through the artifact layer and chosen vector backend boundary.

Current implementation status:
- `Chunker` and `Embedder` already read/write manifests on the contract path
- `Embedder` now carries chunk text/document metadata forward into vector artifacts
- `VectorUpsert` now emits persisted-ready vector manifests with index/namespace metadata
- the current persistence boundary is still local artifact storage rather than a dedicated vector backend

Exit condition:
- A dataset can be ingested without stuffing all artifacts into `input_json`.

### Phase 5. Real Retrieval Path
- Make `HybridRetriever` read from a real persisted index or vector backend.
- Return artifact-backed retrieval candidates.

Current implementation status:
- `HybridRetriever` can now rank persisted vector artifacts coming from manifest/pointer storage
- when no artifact-backed records are available, it still falls back to synthetic retrieval for compatibility
- dense similarity is still a local baseline and not yet a dedicated retrieval backend

Exit condition:
- Retrieval is no longer synthetic.

### Phase 6. Real Answer Path
- Keep the answer grounded in retrieved artifacts.
- Decide the canonical answer path:
  - `AgentCall -> ... -> LLMCall`
  - or `AgentCall -> ... -> LLMAnswer(real executor)`

Exit condition:
- Final answers are grounded and traceable to retrieved artifacts.

### Phase 7. Runtime Hardening
- Move execution state out of process-local memory.
- Make strict polling safe in multi-worker mode.

Exit condition:
- Execution and polling are deployment-safe.

### Phase 8. Real RAG Agent E2E
- Add a strict e2e profile that proves:
  - edge-only tool access
  - schema-free artifact persistence
  - real retrieval path
  - grounded answer path

Exit condition:
- One strict e2e proves a real RAG agent path end to end.

## What Is Not First Priority
- New control nodes such as `Branch`, `Merge`, `LoopGate`, `RetryGate`
- RAG-only database entities
- Any design that makes `AgentCall` depend on a hidden node-local tool catalog

## Working Assumption
Yes, storing chunks and similar artifacts in JSON outputs is possible.

It is acceptable for:
- prototypes
- small and medium corpora
- short-lived execution artifacts
- manifests that point to larger payloads

It is not ideal for:
- large vector payloads inline in DB JSON
- long-term high-volume storage without blob offloading
- heavy retrieval workloads that need dedicated indexing infrastructure

So the right direction is:
- JSON manifest first
- blob/object payload second when size demands it
- dedicated vector backend only where retrieval actually needs it
