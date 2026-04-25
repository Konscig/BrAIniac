import React from "react";
import { Send, Scale, ChevronDown, ChevronUp, MessageCircle } from "lucide-react";

import { judgeChat, readNodeLabel, type ChatMessage, type NodeRecord, type NodeTypeRecord } from "../lib/api";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";
import { cn } from "../lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  tool_calls_used?: string[];
}

export interface AgentChatDockProps {
  pipelineId: number | null;
  pipelineName: string | null;
  pipelineScore: number | null | undefined;
  focusedNode: NodeRecord | null;
  nodeTypes: NodeTypeRecord[];
}

function VerdictChip({ score }: { score: number }): React.ReactElement {
  if (score >= 0.8) return <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[11px] font-medium text-emerald-300">pass {Math.round(score * 100)}%</span>;
  if (score >= 0.6) return <span className="rounded bg-yellow-500/20 px-2 py-0.5 text-[11px] font-medium text-yellow-300">improvement {Math.round(score * 100)}%</span>;
  return <span className="rounded bg-red-500/20 px-2 py-0.5 text-[11px] font-medium text-red-300">fail {Math.round(score * 100)}%</span>;
}

function ToolCallBadges({ tools }: { tools: string[] }): React.ReactElement | null {
  if (!tools.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {tools.map(t => (
        <span key={t} className="rounded bg-muted/60 px-1.5 py-0 text-[10px] text-muted-foreground">
          ⚙ {t.replace(/_/g, " ")}
        </span>
      ))}
    </div>
  );
}

export function AgentChatDock({
  pipelineId,
  pipelineName,
  pipelineScore,
  focusedNode,
}: AgentChatDockProps): React.ReactElement {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [isOpen, setIsOpen] = React.useState(true);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLTextAreaElement | null>(null);

  const focusedNodeLabel = focusedNode ? readNodeLabel(focusedNode) : null;

  React.useEffect(() => {
    setMessages([]);
    setInput("");
  }, [pipelineId]);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // При клике на узел — предзаполняем поле ввода
  React.useEffect(() => {
    if (focusedNode && !isLoading) {
      const label = readNodeLabel(focusedNode);
      setInput(`Расскажи про узел "${label}" — как его можно улучшить?`);
      inputRef.current?.focus();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedNode?.node_id]);

  const handleSend = React.useCallback(async () => {
    if (!pipelineId || !input.trim() || isLoading) return;

    const userText = input.trim();
    setInput("");
    setIsLoading(true);

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: userText };
    setMessages(prev => [...prev, userMsg]);

    const history: ChatMessage[] = messages.map(m => ({ role: m.role, content: m.content }));

    try {
      const res = await judgeChat({
        pipeline_id: pipelineId,
        message: userText,
        history,
        ...(focusedNode ? { focused_node_id: focusedNode.node_id } : {}),
      });

      setMessages(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: res.reply,
          tool_calls_used: res.tool_calls_used,
        },
      ]);
    } catch {
      setMessages(prev => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: "Ошибка при обращении к судье. Попробуйте ещё раз." },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [pipelineId, input, isLoading, messages, focusedNode]);

  const handleKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }, [handleSend]);

  if (!pipelineId) {
    return (
      <Card className="flex flex-col border-border/60 bg-card/80">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <Scale className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">ИИ-Судья</span>
        </div>
        <Separator />
        <p className="px-3 py-4 text-xs text-muted-foreground">Выберите пайплайн для работы с судьёй.</p>
      </Card>
    );
  }

  return (
    <Card className="flex min-h-0 flex-col border-border/60 bg-card/80">
      <button
        type="button"
        className="flex items-center gap-2 px-3 py-2.5 text-left"
        onClick={() => setIsOpen(o => !o)}
      >
        <Scale className="h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">ИИ-Судья</div>
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{pipelineName ?? "Агент"}</span>
            {pipelineScore != null && <VerdictChip score={Number(pipelineScore)} />}
          </div>
        </div>
        {isOpen ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
      </button>

      {isOpen && (
        <>
          <Separator />

          {focusedNodeLabel && (
            <div className="flex items-center gap-1.5 bg-primary/10 px-3 py-1 text-[11px] text-primary">
              <MessageCircle className="h-3 w-3 shrink-0" />
              <span className="truncate">Фокус: <strong>{focusedNodeLabel}</strong></span>
            </div>
          )}

          <ScrollArea className="h-64 min-h-0">
            <div ref={scrollRef} className="flex flex-col gap-2 p-2.5">
              {messages.length === 0 && (
                <div className="rounded-lg border border-dashed border-border/50 p-3 text-center text-[11px] text-muted-foreground">
                  Спросите о пайплайне или кликните на узел для рекомендаций
                </div>
              )}

              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5 text-[12px] leading-[1.45]",
                    msg.role === "user"
                      ? "ml-4 border-primary/20 bg-primary/10 text-foreground"
                      : "mr-2 border-border/50 bg-muted/30 text-muted-foreground"
                  )}
                >
                  <div className="mb-0.5 text-[10px] uppercase tracking-wide opacity-50">
                    {msg.role === "user" ? "Вы" : "Судья"}
                  </div>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  {msg.tool_calls_used && <ToolCallBadges tools={msg.tool_calls_used} />}
                </div>
              ))}

              {isLoading && (
                <div className="mr-2 animate-pulse rounded-lg border border-border/50 bg-muted/30 px-2.5 py-1.5 text-[12px] text-muted-foreground">
                  <div className="mb-0.5 text-[10px] uppercase tracking-wide opacity-50">Судья</div>
                  анализирует…
                </div>
              )}
            </div>
          </ScrollArea>

          <Separator />

          <div className="flex items-end gap-2 p-2">
            <textarea
              ref={inputRef}
              rows={2}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Спросите о пайплайне… (Enter — отправить)"
              disabled={isLoading}
              className="min-h-0 flex-1 resize-none rounded-md border border-border/60 bg-background/80 px-2.5 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50"
            />
            <Button
              type="button"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => void handleSend()}
              disabled={isLoading || !input.trim()}
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>

          {messages.length > 0 && (
            <button
              type="button"
              className="pb-1.5 text-center text-[10px] text-muted-foreground/40 hover:text-muted-foreground"
              onClick={() => setMessages([])}
            >
              очистить историю
            </button>
          )}
        </>
      )}
    </Card>
  );
}
