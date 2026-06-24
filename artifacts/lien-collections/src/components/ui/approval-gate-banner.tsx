import { Lock } from "lucide-react";
import { alpha } from "@/lib/utils";

interface ApprovalGateBannerProps {
  text: string;
  tone?: string;
}

export function ApprovalGateBanner({ text, tone = "#eb143f" }: ApprovalGateBannerProps) {
  return (
    <div
      className="flex items-center gap-3 rounded-lg px-3.5 py-3"
      style={{ background: alpha(tone, 0.07), border: `1px solid ${alpha(tone, 0.28)}` }}
    >
      <Lock className="h-[17px] w-[17px] shrink-0" style={{ color: tone }} />
      <div className="text-xs leading-snug" style={{ color: "var(--text-base)" }}>{text}</div>
    </div>
  );
}
