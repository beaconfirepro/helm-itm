export const COLORS = {
  bg: "#0f1117",
  surface: "#181b24",
  surface2: "#1e222d",
  surface3: "#252a37",
  border: "#2a2f3d",
  text: "#e8eaf0",
  textDim: "#8b90a0",
  textMuted: "#5c6070",
  accent: "#f59e0b",

  status: {
    success: "#14eba3",
    warning: "#f59f0a",
    error: "#eb143f",
    info: "#6366f1",
  },
};

export const ESCALATION_STAGES = [
  "Soft reminder",
  "Pre-lien notice",
  "Lien filing",
  "Agency / attorney",
  "Write-off",
] as const;

export const STAGE_COLOR: Record<string, string> = {
  "Soft reminder": "#14eba3",
  "Pre-lien notice": "#f59f0a",
  "Lien filing": "#eb143f",
  "Agency / attorney": "#a855f7",
  "Write-off": "#5c6070",
};
