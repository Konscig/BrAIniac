import React from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { ModeToggle } from "../components/mode-toggle";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { postJson, type ApiError } from "../lib/api";
import { useAuth, normalizeAuthTokens } from "../providers/AuthProvider";

type AuthMode = "login" | "register";

type AuthFormState = {
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
};

const initialFormState: AuthFormState = {
  email: "",
  username: "",
  password: "",
  confirmPassword: ""
};

type PasswordStrength = {
  score: number;
  label: string;
  tone: string;
};

const passwordStrengthLabels: Array<Omit<PasswordStrength, "score">> = [
  { label: "Слишком короткий", tone: "bg-destructive/60" },
  { label: "Слабый", tone: "bg-amber-500/70" },
  { label: "Средний", tone: "bg-primary/50" },
  { label: "Хороший", tone: "bg-primary/80" },
  { label: "Отличный", tone: "bg-primary" }
];

const MIN_PASSWORD_SCORE = 2;

const evaluatePassword = (value: string): PasswordStrength => {
  const requirements = [
    /[a-z]/.test(value),
    /[A-Z]/.test(value),
    /\d/.test(value),
    /[^\w\s]/.test(value)
  ];

  let score = 0;
  if (value.length >= 8) score += 1;
  score += requirements.filter(Boolean).length;
  if (value.length >= 12) score += 1;
  const clamped = Math.min(score, passwordStrengthLabels.length - 1);
  const { label, tone } = passwordStrengthLabels[clamped];

  return { score: clamped, label, tone };
};

export function AuthPage(): React.ReactElement {
  const [mode, setMode] = React.useState<AuthMode>("login");
  const [form, setForm] = React.useState<AuthFormState>(initialFormState);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const { setSession } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const passwordStrength = React.useMemo(() => evaluatePassword(form.password), [form.password]);
  const strengthProgress = React.useMemo(() => {
    if (!form.password) {
      return 0;
    }
    return ((passwordStrength.score + 1) / passwordStrengthLabels.length) * 100;
  }, [form.password, passwordStrength.score]);
  const redirectTo = React.useMemo(() => {
    const state = location.state as { from?: { pathname?: string } } | null;
    return state?.from?.pathname || "/";
  }, [location.state]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const toggleMode = () => {
    setMode((prev) => (prev === "login" ? "register" : "login"));
    setError(null);
    setForm((prev) => ({ ...prev, password: "", confirmPassword: "" }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      if (mode === "register") {
        if (form.password !== form.confirmPassword) {
          setError("Пароли не совпадают");
          return;
        }
        if (form.password && passwordStrength.score < MIN_PASSWORD_SCORE) {
          setError("Пароль недостаточно надёжный");
          return;
        }
      }

      if (mode === "login") {
        const identifier = form.email.trim().toLowerCase();
        const payload = {
          username: identifier,
          password: form.password
        };
        const response = await postJson(
          "/v1/login",
          payload,
          { credentials: "include" }
        );
        const tokens = normalizeAuthTokens(response);
        if (!tokens) {
          throw new Error("Ответ сервиса аутентификации не содержит токены");
        }
        setSession(tokens);
        navigate(redirectTo, { replace: true });
        return;
      }

      const email = form.email.trim().toLowerCase();
      const username = (form.username.trim() || email).trim();
      const payload = {
        email,
        username,
        password: form.password
      };
      const response = await postJson(
        "/v1/signin",
        payload,
        { credentials: "include" }
      );
      const tokens = normalizeAuthTokens(response);
      if (!tokens) {
        throw new Error("Ответ сервиса регистрации не содержит токены");
      }
      setSession(tokens);
      navigate(redirectTo, { replace: true });
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
              {mode === "register" && (
                <div className="space-y-1">
                  <div className="h-2 w-full rounded-full bg-muted/40">
                    <div
                      className={`h-full rounded-full transition-all ${passwordStrength.tone}`}
                      style={{ width: `${strengthProgress}%` }}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground">{passwordStrength.label}</div>
                </div>
              )}
            </div>

            {mode === "register" && (
              <div className="space-y-2">
                <label htmlFor="confirmPassword" className="text-xs uppercase text-muted-foreground">
                  Подтверждение пароля
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={form.confirmPassword}
                  onChange={handleChange}
                  placeholder="повторите пароль"
                  className="w-full rounded-md border border-border/60 bg-background/80 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}

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
