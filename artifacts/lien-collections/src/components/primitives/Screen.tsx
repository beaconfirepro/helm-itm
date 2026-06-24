import * as React from "react";
import { cn } from "@/lib/utils";

interface ScreenProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Constrains max-width and centers horizontally. Default: "full". */
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "full";
  /** Removes horizontal padding. */
  noPadding?: boolean;
}

const MAX_WIDTH_CLASSES: Record<NonNullable<ScreenProps["maxWidth"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-2xl",
  lg: "max-w-4xl",
  xl: "max-w-6xl",
  "2xl": "max-w-screen-2xl",
  full: "max-w-full",
};

/**
 * Screen — full-height content area that accounts for the nav chrome.
 *
 * On mobile (<768 px) it reserves 56 px at the bottom for the tab bar.
 * On desktop it sits inside the side rail's right column.
 */
export function Screen({
  children,
  className,
  maxWidth = "full",
  noPadding = false,
  ...props
}: ScreenProps) {
  return (
    <main
      className={cn(
        "flex-1 min-h-0 overflow-y-auto",
        "pb-14 md:pb-0",
        !noPadding && "px-4 py-4 md:px-6 md:py-6",
        MAX_WIDTH_CLASSES[maxWidth],
        className,
      )}
      {...props}
    >
      {children}
    </main>
  );
}
