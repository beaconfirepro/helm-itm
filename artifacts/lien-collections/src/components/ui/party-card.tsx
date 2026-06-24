interface PartyCardProps {
  role: string;
  name: string;
  address?: string | null;
}

export function PartyCard({ role, name, address }: PartyCardProps) {
  return (
    <div className="rounded-lg border px-4 py-3" style={{ background: "var(--surface)", borderColor: "var(--helm-border)" }}>
      <div className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted-color)" }}>{role}</div>
      <div className="mt-1 text-[13.5px] font-semibold" style={{ color: "var(--text-base)" }}>{name}</div>
      {address && <div className="mt-0.5 text-[11.5px]" style={{ color: "var(--text-dim)" }}>{address}</div>}
    </div>
  );
}
