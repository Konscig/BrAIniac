# Backend Runtime Truth Snapshot (2026-04-19)

## Purpose
This document records the current backend truth and replaces outdated assumptions.

## Current Truth
- The backend runtime has implemented node handlers for:
  - `Trigger`
  - `ManualInput`
  - `DatasetInput`
  - `PromptBuilder`
  - `Filter`
  - `Ranker`
  - `LLMCall`
  - `AgentCall`
  - `ToolNode`
  - `Parser`
  - `SaveResult`
- `ToolNode` currently supports `http-json` and `openrouter-embeddings`.
- `ToolNode` requires an explicit tool binding on the node itself.
- The backend contract endpoint `POST /tool-executor/contracts` can return `contract_output`.
- Local synthetic contract output is still optional and controlled by runtime config.

## AgentCall Truth
- `AgentCall` has an internal bounded loop and can orchestrate tool calls.
- `AgentCall` returns execution diagnostics such as provider info and `tool_call_trace`.
- `AgentCall` tool access must be treated as edge-derived only.
- `AgentCall` must not depend on hidden node-local tool catalogs such as `allowedToolIds`, `allowedToolNames`, or `agent.tools`.
- Canonical edge contracts for callable tools are explicit `tool_ref` / `tool_refs` artifacts.
- Direct `tool_node` outputs connected by edges are still accepted as explicit callable tool artifacts.

## RAG Truth
- `DocumentLoader` is still mostly contract-ready, but it now has a first real local-source path.
- `DocumentLoader` can already load local text and JSON bundle sources from:
  - `workspace://...`
  - `file://...`
  - plain local paths under the configured workspace root
- Unsupported URIs still fall back to synthetic contract behavior.
- `VectorUpsert` now writes artifact-backed vector payloads with chunk/document metadata into manifest-friendly outputs.
- `HybridRetriever` can now rank persisted vector artifacts when those artifacts include chunk text/metadata.
- `HybridRetriever` still keeps a synthetic fallback path when no retrievable artifact-backed records are available.
- `LLMAnswer` in ToolNode contract mode is still deterministic on the default path.
- Real strict RAG should not be claimed yet.

## Storage Truth
- The backend should not introduce RAG-specific core DB entities for documents, chunks, and vectors.
- The preferred direction is schema-free artifact storage:
  - existing JSON outputs/manifests first
  - blob/object storage pointers second
  - dedicated vector backend only where retrieval actually needs it
- Contract outputs already expose inline manifests for the baseline artifact flow:
  - `documents_manifest`
  - `chunks_manifest`
  - `vectors_manifest`
- Downstream contracts can now also emit and consume:
  - `retrieval_candidates` manifests
  - `context_bundle` manifests
- Oversized manifests can now be externalized into `external-blob` payloads with `pointer.kind = local-file`.
- Manifest consumers can already reload those local-file `external-blob` payloads.

## Still Not Ready For A Real RAG Agent
- Edge-based tool advertising is partially productized via explicit `tool_ref` / `tool_refs`, but still needs stronger validation and broader runtime adoption.
- Real document loading is only partially implemented.
- Vector persistence and retrieval now have a local artifact-backed baseline, but not a production-grade dedicated backend.
- Execution state is still process-local, which is risky for multi-worker deployment.

## Obsolete Assumptions
- "AgentCall can receive tools from node-local agent config" is obsolete.
- "We should solve RAG persistence by adding new RAG tables to the main schema" is obsolete.
- "A passing contract-mode flow proves a real RAG backend" is false.

## Canonical Sources In Code
- Runtime registry:
  - `backend/src/services/application/node/handlers/node-handler.registry.ts`
- Runtime handlers:
  - `backend/src/services/application/node/handlers/*.node-handler.ts`
- Shared node runtime logic:
  - `backend/src/services/application/node/handlers/node-handler.shared.ts`
- Tool contract registry:
  - `backend/src/services/application/tool/contracts/index.ts`
- Tool contract logic:
  - `backend/src/services/application/tool/contracts/*.tool.ts`
