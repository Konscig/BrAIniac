import React from "react";

import { Button } from "./ui/button";
import { cn } from "../lib/utils";

export type EnvironmentMode = "test" | "hybrid" | "real";

const MODE_LABELS: Record<EnvironmentMode, { title: string; subtitle: string }> = {
  test: { title: "Тест", subtitle: "моки" },
  hybrid: { title: "Гибрид", subtitle: "частично" },
  real: { title: "Реал", subtitle: "боевой" }
};

interface EnvironmentModeSwitchProps {
  value: EnvironmentMode;
  onChange: (value: EnvironmentMode) => void;
}

export function EnvironmentModeSwitch({
  value,
  onChange
}: EnvironmentModeSwitchProps): React.ReactElement {
  return (
    <div className="flex items-center gap-2 rounded-full border border-border/50 bg-background/80 p-1 backdrop-blur">
  {(Object.keys(MODE_LABELS) as EnvironmentMode[]).map((key) => {
        const active = value === key;
        const { title, subtitle } = MODE_LABELS[key];
        return (
          <Button
            key={key}
            variant={active ? "default" : "ghost"}
            size="sm"
            className={cn(
              "flex-1 rounded-full px-4 py-2 text-xs uppercase tracking-wide",
              active ? "shadow-soft" : "text-muted-foreground"
            )}
            onClick={() => onChange(key)}
          >
            <span className="flex flex-col leading-none">
              <span>{title}</span>
              <span className="text-[0.65rem] font-normal text-muted-foreground">
                {subtitle}
              </span>
            </span>
          </Button>
        );
      })}
    </div>
  );
}
