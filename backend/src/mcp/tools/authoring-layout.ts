import { HttpError } from '../../common/http-error.js';

export type CanvasPosition = {
  x: number;
  y: number;
};

export type CanvasLayoutHint = {
  direction?: 'left_to_right' | 'top_to_bottom' | undefined;
  column?: number | undefined;
  row?: number | undefined;
  xGap?: number | undefined;
  yGap?: number | undefined;
};

export type ExistingCanvasNode = {
  ui_json?: unknown;
};

const DEFAULT_X_GAP = 380;
const DEFAULT_Y_GAP = 220;
const MIN_X_GAP = 340;
const MIN_Y_GAP = 200;

function finiteNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readNodePosition(node: ExistingCanvasNode): CanvasPosition | undefined {
  const uiJson = node.ui_json;
  if (!uiJson || typeof uiJson !== 'object' || Array.isArray(uiJson)) {
    return undefined;
  }

  const record = uiJson as Record<string, unknown>;
  const nested = record.position && typeof record.position === 'object' ? (record.position as Record<string, unknown>) : {};
  const x = finiteNumber(record.x) ?? finiteNumber(nested.x);
  const y = finiteNumber(record.y) ?? finiteNumber(nested.y);
  return x !== undefined && y !== undefined ? { x, y } : undefined;
}

function hasOverlap(position: CanvasPosition, existing: CanvasPosition[], xGap: number, yGap: number): boolean {
  return existing.some((candidate) => Math.abs(candidate.x - position.x) < xGap && Math.abs(candidate.y - position.y) < yGap);
}

function normalizedGap(value: unknown, minimum: number, fallback: number): number {
  const parsed = finiteNumber(value);
  return parsed !== undefined ? Math.max(minimum, parsed) : fallback;
}

function normalizedIndex(value: unknown): number {
  const parsed = finiteNumber(value);
  return parsed !== undefined && Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export function resolveCanvasPosition(input: {
  position?: Partial<CanvasPosition>;
  layout?: CanvasLayoutHint;
  existingNodes?: ExistingCanvasNode[];
}): { position: CanvasPosition; diagnostics: Array<{ code: string; message: string; details?: Record<string, unknown> }> } {
  const xGap = normalizedGap(input.layout?.xGap, MIN_X_GAP, DEFAULT_X_GAP);
  const yGap = normalizedGap(input.layout?.yGap, MIN_Y_GAP, DEFAULT_Y_GAP);
  const existingPositions = (input.existingNodes ?? []).map(readNodePosition).filter((item): item is CanvasPosition => Boolean(item));
  const diagnostics: Array<{ code: string; message: string; details?: Record<string, unknown> }> = [];

  let position: CanvasPosition | undefined;
  const explicitX = finiteNumber(input.position?.x);
  const explicitY = finiteNumber(input.position?.y);
  if (explicitX !== undefined && explicitY !== undefined) {
    position = { x: explicitX, y: explicitY };
  } else {
    const column = normalizedIndex(input.layout?.column);
    const row = normalizedIndex(input.layout?.row);
    const direction = input.layout?.direction ?? 'left_to_right';
    position =
      direction === 'top_to_bottom'
        ? { x: row * xGap, y: column * yGap }
        : { x: column * xGap, y: row * yGap };
    diagnostics.push({
      code: 'MCP_LAYOUT_DERIVED',
      message: 'canvas position was derived from layout hints',
      details: { direction, column, row, xGap, yGap },
    });
  }

  for (let attempt = 0; attempt < 100 && hasOverlap(position, existingPositions, xGap, yGap); attempt += 1) {
    position = { x: position.x + xGap, y: position.y };
    diagnostics.push({
      code: 'MCP_LAYOUT_ADJUSTED',
      message: 'canvas position was adjusted to avoid overlapping an existing node',
      details: { attempt: attempt + 1, xGap, yGap },
    });
  }

  if (hasOverlap(position, existingPositions, xGap, yGap)) {
    throw new HttpError(400, {
      ok: false,
      code: 'MCP_LAYOUT_OVERLAP',
      error: 'could not place node without overlapping existing canvas nodes',
      details: { position, xGap, yGap },
    });
  }

  return { position, diagnostics };
}
