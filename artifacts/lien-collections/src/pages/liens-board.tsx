import * as React from "react";
import { FileText } from "lucide-react";

export default function LiensPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8" style={{ color: "var(--text-muted-color)" }}>
      <FileText className="h-12 w-12 opacity-40" />
      <div className="text-center">
        <p className="text-[15px] font-semibold" style={{ color: "var(--text-base)" }}>Liens</p>
        <p className="mt-1 text-[13px]">This page is coming soon.</p>
      </div>
    </div>
  );
}
