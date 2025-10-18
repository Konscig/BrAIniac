import React from "react";
import { Github, LogIn } from "lucide-react";
import { Link } from "react-router-dom";

import { ModeToggle } from "../components/mode-toggle";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Separator } from "../components/ui/separator";

const providers = [
  { id: "github", label: "GitHub", icon: Github },
  { id: "google", label: "Google", icon: LogIn },
  { id: "vk", label: "VK", icon: LogIn },
  { id: "yandex", label: "Яндекс", icon: LogIn }
];

export function AuthPage(): React.ReactElement {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_center,rgba(94,234,212,0.08),transparent_55%)]" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(148,163,184,0.1)_1px,transparent_1px),linear-gradient(0deg,rgba(148,163,184,0.1)_1px,transparent_1px)]" style={{ backgroundSize: "48px 48px" }} />
      <div className="absolute inset-0 bg-background/70 backdrop-blur" />

      <div className="absolute left-8 top-8">
        <Link to="/" className="text-sm font-semibold text-muted-foreground hover:text-foreground">
          ← Назад в студию
        </Link>
      </div>
      <div className="absolute right-8 top-8">
        <ModeToggle />
      </div>

      <Card className="z-10 w-full max-w-sm border-border/60 bg-card/80 shadow-soft">
        <CardHeader className="space-y-2 text-center">
          <div className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
            BrAIniac
          </div>
          <h2 className="text-2xl font-semibold">Авторизация</h2>
          <p className="text-sm text-muted-foreground">
            Войдите, чтобы управлять агентами и пайплайнами.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs uppercase text-muted-foreground">Email</label>
            <input
              type="email"
              placeholder="example@brainiac.ai"
              className="w-full rounded-md border border-border/60 bg-background/80 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs uppercase text-muted-foreground">Пароль</label>
            <input
              type="password"
              placeholder="••••••••"
              className="w-full rounded-md border border-border/60 bg-background/80 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <Button className="w-full rounded-full">Войти</Button>
          <Button variant="secondary" className="w-full rounded-full">
            Создать аккаунт
          </Button>
          <Separator className="my-4" />
          <div className="text-center text-xs uppercase tracking-wide text-muted-foreground">
            Войти с помощью
          </div>
          <div className="flex items-center justify-center gap-3">
            {providers.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-background/70 text-muted-foreground transition hover:text-foreground"
              >
                <Icon className="h-5 w-5" />
                <span className="sr-only">{label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
