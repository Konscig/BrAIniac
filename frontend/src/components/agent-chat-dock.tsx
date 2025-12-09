import React from "react";
import { MessageCircle } from "lucide-react";

import { Button } from "./ui/button";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Separator } from "./ui/separator";

type Message = {
  id: string;
  role: "judge" | "user";
  content: string;
};

export function AgentChatDock(): React.ReactElement {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [input, setInput] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  // initial messages: backend doesn't expose history endpoint yet — start empty
  React.useEffect(() => {
    setMessages([]);
  }, []);

  // автоскролл при добавлении сообщений
  React.useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleSend() {
    const userMessage = input.trim();
    if (!userMessage) return;

    const newUserMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: userMessage,
    };

    // добавляем сообщение пользователя на экран сразу
    setMessages((prev) => [...prev, newUserMsg]);
    setInput("");

    setLoading(true);
    try {
      // отправляем на backend — маршрут определён в `judge.chat.routes.ts` as POST /chat
      const res = await fetch("/api/judge/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage }),
      });

      const answer = await res.json();
      const judgeMsg: Message = {
        id: crypto.randomUUID(),
        role: "judge",
        content: answer.reply ?? answer ?? "(пустой ответ)",
      };

      // добавляем ответ судьи
      setMessages((prev) => [...prev, judgeMsg]);
    } catch (err) {
      const errMsg: Message = {
        id: crypto.randomUUID(),
        role: "judge",
        content: "Ошибка при обращении к серверу",
      };
      setMessages((prev) => [...prev, errMsg]);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-80 border-border/60 bg-background/85 text-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <div className="text-xs uppercase text-muted-foreground">ИИ судья</div>
          <div className="text-lg font-semibold">Наблюдатель</div>
        </div>
        <Button size="icon" variant="ghost" className="rounded-full">
          <MessageCircle className="h-4 w-4" />
        </Button>
      </CardHeader>
      <Separator className="mb-3" />
      <CardContent className="space-y-3">
        <div ref={containerRef} className="space-y-2 max-h-80 overflow-y-auto pr-2">
          {messages.map((message) => (
            <div
              key={message.id}
              className="rounded-lg border border-border/50 bg-muted/40 p-3"
            >
              <div className="text-xs uppercase text-muted-foreground">
                {message.role === "judge" ? "Судья" : "Вы"}
              </div>
              <p className="mt-1 text-sm leading-snug text-muted-foreground">
                {message.content}
              </p>
            </div>
          ))}

          {loading && (
            <div className="rounded-lg border border-border/50 bg-muted/40 p-3">
              <div className="text-xs uppercase text-muted-foreground">Судья</div>
              <p className="mt-1 text-sm leading-snug text-muted-foreground">
                ...
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Написать заметку..."
            className="flex-1 rounded-md border px-3 py-2 text-sm bg-background/80"
          />
          <Button
            className="w-28"
            variant="secondary"
            onClick={() => void handleSend()}
            disabled={loading || !input.trim()}
          >
            {loading ? "Отправка..." : "Отправить"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
