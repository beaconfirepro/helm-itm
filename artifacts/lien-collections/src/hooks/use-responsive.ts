import * as React from "react";

const BREAKPOINTS = {
  mobile: 0,
  tablet: 768,
  desktop: 1024,
} as const;

export type Breakpoint = "mobile" | "tablet" | "desktop";

export interface ResponsiveState {
  breakpoint: Breakpoint;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  width: number;
}

function getBreakpoint(width: number): Breakpoint {
  if (width >= BREAKPOINTS.desktop) return "desktop";
  if (width >= BREAKPOINTS.tablet) return "tablet";
  return "mobile";
}

export function useResponsive(): ResponsiveState {
  const [state, setState] = React.useState<ResponsiveState>(() => {
    if (typeof window === "undefined") {
      return { breakpoint: "desktop", isMobile: false, isTablet: false, isDesktop: true, width: 1280 };
    }
    const w = window.innerWidth;
    const bp = getBreakpoint(w);
    return {
      breakpoint: bp,
      isMobile: bp === "mobile",
      isTablet: bp === "tablet",
      isDesktop: bp === "desktop",
      width: w,
    };
  });

  React.useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      const bp = getBreakpoint(w);
      setState({ breakpoint: bp, isMobile: bp === "mobile", isTablet: bp === "tablet", isDesktop: bp === "desktop", width: w });
    };
    window.addEventListener("resize", update);
    update();
    return () => window.removeEventListener("resize", update);
  }, []);

  return state;
}
