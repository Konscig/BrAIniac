import React from "react";
import { ArrowDown, ArrowUp, Loader2, Trash2, Upload } from "lucide-react";

import { uploadRagCorpus, type ApiError } from "../lib/api";
import { Button } from "./ui/button";

const ACCEPT = ".txt,.sql,.csv";
const MAX_FILE_BYTES = 1_048_576;
const MAX_FILES_PER_NODE = 64;

export interface RagDatasetConfigValue {
  uris: string[];
}

export interface RagDatasetConfigProps {
  value: RagDatasetConfigValue;
  onChange: (next: RagDatasetConfigValue) => void;
  disabled?: boolean;
}

function shortNameFromUri(uri: string): string {
  const tail = uri.split("/").pop() ?? uri;
  return tail.length > 0 ? tail : uri;
}

function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  if (item === undefined) return arr;
  next.splice(to, 0, item);
  return next;
}

export function RagDatasetConfig({ value, onChange, disabled }: RagDatasetConfigProps): React.ReactElement {
  const [error, setError] = React.useState<string | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const uris = Array.isArray(value?.uris) ? value.uris : [];

  const handlePickFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    setError(null);

    if (file.size > MAX_FILE_BYTES) {
      setError(`Файл больше 1 МБ (${file.size} Б).`);
      input.value = "";
      return;
    }
    if (uris.length >= MAX_FILES_PER_NODE) {
      setError(`Превышен лимит ${MAX_FILES_PER_NODE} файлов на узел.`);
      input.value = "";
      return;
    }

    setIsUploading(true);
    try {
      const result = await uploadRagCorpus(file);
      if (uris.includes(result.uri)) {
        setError("Этот файл уже добавлен в узел.");
        return;
      }
      onChange({ uris: [...uris, result.uri] });
    } catch (err) {
      const apiError = err as ApiError;
      const details = apiError.details && typeof apiError.details === "object" ? (apiError.details as { message?: string }) : null;
      setError(details?.message ?? apiError.message ?? "Не удалось загрузить файл.");
    } finally {
      setIsUploading(false);
      input.value = "";
    }
  };

  const handleRemove = (index: number) => {
    onChange({ uris: uris.filter((_, i) => i !== index) });
  };

  const handleMove = (index: number, direction: -1 | 1) => {
    onChange({ uris: moveItem(uris, index, index + direction) });
  };

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled || isUploading}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] text-muted-foreground">
          Файлы корпуса: <span className="text-foreground">{uris.length}</span> / {MAX_FILES_PER_NODE}. Поддерживаются txt, sql, csv (≤1 МБ каждый).
        </div>
        <Button
          type="button"
          size="sm"
          onClick={handlePickFile}
          disabled={disabled || isUploading || uris.length >= MAX_FILES_PER_NODE}
        >
          {isUploading ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Загрузка…
            </>
          ) : (
            <>
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Загрузить файл
            </>
          )}
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-200">
          {error}
        </div>
      )}

      {uris.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/50 px-3 py-6 text-center text-[11px] text-muted-foreground">
          Корпус пуст. Загрузите хотя бы один файл, чтобы пайплайн прошёл preflight-валидацию.
        </div>
      ) : (
        <ul className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
          {uris.map((uri, index) => (
            <li
              key={uri}
              className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-muted/10 px-2.5 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-medium text-foreground" title={uri}>
                  {shortNameFromUri(uri)}
                </div>
                <div className="truncate text-[10px] text-muted-foreground" title={uri}>
                  {uri}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground transition hover:bg-muted/20 hover:text-foreground disabled:opacity-30"
                  disabled={disabled || index === 0}
                  onClick={() => handleMove(index, -1)}
                  aria-label="Переместить вверх"
                  title="Переместить вверх"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground transition hover:bg-muted/20 hover:text-foreground disabled:opacity-30"
                  disabled={disabled || index === uris.length - 1}
                  onClick={() => handleMove(index, 1)}
                  aria-label="Переместить вниз"
                  title="Переместить вниз"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="rounded p-1 text-red-300 transition hover:bg-red-500/10 hover:text-red-200 disabled:opacity-30"
                  disabled={disabled}
                  onClick={() => handleRemove(index)}
                  aria-label="Удалить"
                  title="Удалить"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
