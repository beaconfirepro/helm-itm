import * as React from "react";
import { cn } from "@/lib/utils";

interface GridProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Number of columns at each breakpoint. Default: auto 1→2→3. */
  cols?: 1 | 2 | 3 | 4 | "auto";
  /** Gap size. Default: "md". */
  gap?: "sm" | "md" | "lg";
}

const GAP_CLASSES: Record<NonNullable<GridProps["gap"]>, string> = {
  sm: "gap-2",
  md: "gap-4",
  lg: "gap-6",
};

const COLS_CLASSES: Record<NonNullable<GridProps["cols"]>, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
  auto: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
};

/**
 * Grid — responsive CSS grid wrapper with sensible column defaults.
 */
export function Grid({
  children,
  className,
  cols = "auto",
  gap = "md",
  ...props
}: GridProps) {
  return (
    <div
      className={cn("grid", COLS_CLASSES[cols], GAP_CLASSES[gap], className)}
      {...props}
    >
      {children}
    </div>
  );
}
