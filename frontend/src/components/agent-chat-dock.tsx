import React from "react";
import { MessageCircle } from "lucide-react";

import { Button } from "./ui/button";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Separator } from "./ui/separator";

const placeholderMessages = [
  {
    id: "1",
    role: "Судья",
    content: "Подумайте над валидацией входных данных на втором узле."
  },
  {
    id: "2",
    role: "Вы",
    content: "Принято. Добавлю проверку и логирование."
  }
];

export function AgentChatDock(): React.ReactElement {
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
        <div className="space-y-2">
          {placeholderMessages.map((message) => (
            <div
              key={message.id}
              className="rounded-lg border border-border/50 bg-muted/40 p-3"
            >
              <div className="text-xs uppercase text-muted-foreground">
                {message.role}
              </div>
              <p className="mt-1 text-sm leading-snug text-muted-foreground">
                {message.content}
              </p>
            </div>
          ))}
        </div>
        <Button className="w-full" variant="secondary">
          Оставить заметку
        </Button>
      </CardContent>
    </Card>
  );
}
