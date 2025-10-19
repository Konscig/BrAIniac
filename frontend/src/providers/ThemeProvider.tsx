import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

type ThemeContextValue = {
  theme: Theme;
  resolved: "light" | "dark";
  setTheme: (t: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      return (localStorage.getItem("theme") as Theme) || "system";
    } catch {
      return "system";
    }
  });

  const getSystem = () => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return "light";
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  };

  const [resolved, setResolved] = useState<"light" | "dark">(() =>
    theme === "system" ? getSystem() : theme
  );

  useEffect(() => {
    if (theme !== "system") {
      setResolved(theme);
      return;
    }

    if (typeof window === "undefined") {
      setResolved("light");
      return;
    }

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const updateResolved = () => {
      setResolved(mq.matches ? "dark" : "light");
    };

    updateResolved();
    mq.addEventListener?.("change", updateResolved);
    return () => mq.removeEventListener?.("change", updateResolved);
  }, [theme]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      root.classList.toggle("dark", resolved === "dark");
      root.classList.toggle("light", resolved === "light");
    }

    try {
      localStorage.setItem("theme", theme);
    } catch {}
  }, [resolved, theme]);

  const setTheme = (t: Theme) => setThemeState(t);

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
};
