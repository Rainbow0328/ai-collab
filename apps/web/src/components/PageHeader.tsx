import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header style={{
      height: "var(--header-h)",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 var(--sp-5)",
      borderBottom: "1px solid var(--c-border)",
      background: "var(--c-bg-elevated)",
      flexShrink: 0,
    }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{
          fontSize: "var(--fs-md)", fontWeight: 700,
          color: "var(--c-text-primary)",
          lineHeight: 1.2,
        }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{
            fontSize: "var(--fs-xs)",
            color: "var(--c-text-tertiary)",
            marginTop: "2px",
          }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
          {actions}
        </div>
      )}
    </header>
  );
}

export function PageContainer({ children }: { children: ReactNode }) {
  return (
    <div style={{ flex: 1, overflow: "auto", padding: "var(--sp-5)" }}>
      <div style={{ maxWidth: "var(--content-max)", margin: "0 auto" }}>
        {children}
      </div>
    </div>
  );
}
