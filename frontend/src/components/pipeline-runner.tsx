import React from "react";
import { Loader2, Play } from "lucide-react";

import { Button } from "./ui/button";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Separator } from "./ui/separator";
import type { ExecutePipelineResponse, NodeExecutionResultDto } from "../lib/api";

interface PipelineRunnerProps {
  triggerInput: string;
  onTriggerInputChange: (value: string) => void;
  onRun: () => void;
  isRunning: boolean;
  isDisabled: boolean;
  result: ExecutePipelineResponse | null;
  error: string | null;
}

const formatStatus = (status: string): string => {
  switch (status) {
    case "completed":
      return "Успешно";
    case "running":
      return "Выполняется";
    case "error":
      return "Ошибка";
    default:
      return status;
  }
};

const ResultRow: React.FC<{ result: NodeExecutionResultDto }> = ({ result }) => (
  <div className="space-y-1 rounded-lg border border-border/50 bg-muted/40 p-3">
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-sm font-semibold text-foreground">Узел {result.nodeId}</span>
      <span className="text-xs text-muted-foreground">{formatStatus(result.status)}</span>
    </div>
    {result.output && (
      <p className="text-xs leading-snug text-muted-foreground break-words whitespace-pre-wrap">
        {result.output}
      </p>
    )}
  </div>
);

export const PipelineRunner: React.FC<PipelineRunnerProps> = ({
  triggerInput,
  onTriggerInputChange,
  onRun,
  isRunning,
  isDisabled,
  result,
  error
}) => {
  const finalOutput = result?.finalOutput?.trim();

  return (
    <Card className="w-full border-border/60 bg-background/85 text-sm">
      <CardHeader className="pb-3">
        <div className="text-xs uppercase text-muted-foreground">Запуск пайплайна</div>
        <div className="text-lg font-semibold">RAG Runtime</div>
      </CardHeader>
      <Separator className="mb-3" />
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <label htmlFor="trigger-input" className="text-xs text-muted-foreground">
            Входящий вопрос
          </label>
          <textarea
            id="trigger-input"
            value={triggerInput}
            onChange={(event) => onTriggerInputChange(event.target.value)}
            className="h-24 w-full resize-none rounded-lg border border-border/60 bg-muted/20 p-3 text-sm text-foreground focus:border-primary focus:outline-none"
            placeholder={'Например: "Расскажи про архитектуру нашего проекта"'}
          />
          <Button
            type="button"
            onClick={onRun}
            disabled={isRunning || isDisabled}
            className="w-full rounded-full"
          >
            {isRunning ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Выполняем...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" /> Запустить
              </>
            )}
          </Button>
          {error && <p className="text-xs text-red-300">{error}</p>}
        </div>
        {result && (
          <div className="space-y-3">
            {finalOutput && (
              <div className="rounded-lg border border-primary/40 bg-primary/10 p-3">
                <div className="text-xs uppercase text-muted-foreground">Ответ</div>
                <p className="mt-1 text-sm text-foreground whitespace-pre-wrap">{finalOutput}</p>
              </div>
            )}
            <div className="space-y-2">
              <div className="text-xs uppercase text-muted-foreground">Детали выполнения</div>
              {result.results.length === 0 ? (
                <p className="text-xs text-muted-foreground">Пайплайн не вернул результатов.</p>
              ) : (
                result.results.map((nodeResult) => (
                  <ResultRow key={nodeResult.nodeId} result={nodeResult} />
                ))
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
