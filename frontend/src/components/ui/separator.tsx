import React from "react";

import { cn } from "../../lib/utils";

interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Separator({
  className,
  orientation = "horizontal",
  ...props
}: SeparatorProps & { orientation?: "horizontal" | "vertical" }): React.ReactElement {
  return (
    <div
      className={cn(
        "shrink-0 bg-border/60",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className
      )}
      {...props}
    />
  );
}
