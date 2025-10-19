import React from "react";
import { Link, useNavigate } from "react-router-dom";

import { ModeToggle } from "../components/mode-toggle";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { postJson, type ApiError } from "../lib/api";

type AuthMode = "login" | "register";

type AuthFormState = {
  email: string;
  username: string;
  password: string;
};

const initialFormState: AuthFormState = {
  email: "",
  username: "",
  password: ""
};

export function AuthPage(): React.ReactElement {
  const [mode, setMode] = React.useState<AuthMode>("login");
  const [form, setForm] = React.useState<AuthFormState>(initialFormState);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const navigate = useNavigate();

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const toggleMode = () => {
    setMode((prev) => (prev === "login" ? "register" : "login"));
    setError(null);
    setForm((prev) => ({ ...prev, password: "" }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      if (mode === "login") {
        const identifier = form.email.trim().toLowerCase();
        const payload = {
          username: identifier,
          password: form.password
        };
        const tokens = await postJson<{ access_token: string; refresh_token: string }>(
          "/v1/login",
          payload,
          { credentials: "include" }
        );
        localStorage.setItem("brainiac.tokens", JSON.stringify(tokens));
        navigate("/");
        return;
      }

  const email = form.email.trim().toLowerCase();
      const username = (form.username.trim() || email).trim();
      const payload = {
        email,
        username,
        password: form.password
      };
      const tokens = await postJson<{ access_token: string; refresh_token: string }>(
        "/v1/signin",
        payload,
        { credentials: "include" }
      );
      localStorage.setItem("brainiac.tokens", JSON.stringify(tokens));
      navigate("/");
    } catch (err) {
      const apiError = err as ApiError;
      let message = "Не удалось выполнить запрос";
      if (apiError.details && typeof apiError.details === "object") {
        const details = apiError.details as { message?: string };
        if (details.message) {
          message = details.message;
        }
      } else if (apiError instanceof Error && apiError.message) {
        message = apiError.message;
      }
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_center,rgba(39,135,245,0.12),transparent_60%)]" />
      <div
        className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(0deg,rgba(148,163,184,0.12)_1px,transparent_1px)]"
        style={{ backgroundSize: "48px 48px" }}
      />
      <div className="absolute inset-0 bg-background/75 backdrop-blur" />

      <div className="absolute left-8 top-8">
        <Link to="/" className="text-sm font-semibold text-muted-foreground transition hover:text-foreground">
          ← Назад в студию
        </Link>
      </div>
      <div className="absolute right-8 top-8">
        <ModeToggle />
      </div>

      <Card className="z-10 w-full max-w-sm border-border/60 bg-card/85 shadow-soft">
        <CardHeader className="space-y-2 text-center">
          <div className="text-xs uppercase tracking-[0.35em] text-muted-foreground">BrAIniac</div>
          <h2 className="text-2xl font-semibold">
            {mode === "login" ? "Войти" : "Создать аккаунт"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {mode === "login"
              ? "Введите email и пароль для входа."
              : "Заполните данные, чтобы начать работу."}
          </p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label htmlFor="email" className="text-xs uppercase text-muted-foreground">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={form.email}
                onChange={handleChange}
                placeholder="example@brainiac.ai"
                className="w-full rounded-md border border-border/60 bg-background/80 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {mode === "register" && (
              <div className="space-y-2">
                <label htmlFor="username" className="text-xs uppercase text-muted-foreground">
                  Имя пользователя (опционально)
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  value={form.username}
                  onChange={handleChange}
                  placeholder="brainiac-user"
                  className="w-full rounded-md border border-border/60 bg-background/80 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="password" className="text-xs uppercase text-muted-foreground">
                Пароль
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={6}
                value={form.password}
                onChange={handleChange}
                placeholder="••••••••"
                className="w-full rounded-md border border-border/60 bg-background/80 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full rounded-full" disabled={isLoading}>
              {isLoading ? "Обработка..." : mode === "login" ? "Войти" : "Создать аккаунт"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full rounded-full"
              disabled={isLoading}
              onClick={toggleMode}
            >
              {mode === "login" ? "Нужен аккаунт? Зарегистрируйтесь" : "Уже есть аккаунт? Войти"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
