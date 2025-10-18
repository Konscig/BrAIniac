import React from "react";
import { useTheme } from "../providers/ThemeProvider";

export const ThemeToggle: React.FC = () => {
  const { theme, setTheme, resolved } = useTheme();

  return (
    <div className="flex items-center gap-2">
      <button
        className={`px-2 py-1 rounded ${resolved === "light" ? "bg-gray-200 text-gray-800" : "bg-transparent"}`}
        onClick={() => setTheme("light")}
        title="Light"
      >
        ☀
      </button>
      <button
        className={`px-2 py-1 rounded ${resolved === "dark" ? "bg-gray-700 text-white" : "bg-transparent"}`}
        onClick={() => setTheme("dark")}
        title="Dark"
      >
        ☾
      </button>
      <button
        className={`px-2 py-1 rounded ${theme === "system" ? "ring-2 ring-offset-1" : "bg-transparent"}`}
        onClick={() => setTheme("system")}
        title="Follow system"
      >
        ⚙
      </button>
    </div>
  );
};
