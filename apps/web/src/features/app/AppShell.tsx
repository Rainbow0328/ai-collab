import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useTheme } from "@/components/shared/ThemeProvider";
import { ToastContainer } from "@/components/ui";

const NAV_ITEMS = [
  { to: "/", label: "协作", icon: getIcon("collab") },
  { to: "/knowledge", label: "知识库", icon: getIcon("knowledge") },
  { to: "/models", label: "模型", icon: getIcon("models") },
  { to: "/mcp", label: "MCP", icon: getIcon("mcp") },
  { to: "/preferences", label: "偏好", icon: getIcon("preferences") },
] as const;

export function AppShell() {
  const { theme, toggleTheme } = useTheme();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Sidebar */}
      <aside style={{
        width: "var(--sidebar-w)",
        flexShrink: 0,
        background: "var(--c-sidebar-bg)",
        borderRight: "1px solid var(--c-sidebar-border)",
        display: "flex",
        flexDirection: "column",
      }}>
        {/* Brand */}
        <div style={{
          height: "var(--header-h)",
          display: "flex",
          alignItems: "center",
          gap: "var(--sp-3)",
          padding: "0 var(--sp-4)",
          borderBottom: "1px solid var(--c-sidebar-border)",
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: "var(--r-md)",
            background: "linear-gradient(135deg, var(--c-accent), #818cf8)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 700, color: "#fff", flexShrink: 0,
          }}>
            A
          </div>
          <div style={{ overflow: "hidden" }}>
            <div style={{
              fontSize: "var(--fs-sm)", fontWeight: 700,
              color: "var(--c-sidebar-text-active)",
              lineHeight: 1.2,
            }}>
              LoopMarshal
            </div>
            <div style={{
              fontSize: "var(--fs-xs)",
              color: "var(--c-sidebar-text-muted)",
              lineHeight: 1.2,
            }}>
              Agent Workbench
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "var(--sp-2)", display: "flex", flexDirection: "column", gap: "2px" }}>
          {NAV_ITEMS.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                style={{
                  display: "flex", alignItems: "center", gap: "var(--sp-3)",
                  padding: "var(--sp-2) var(--sp-3)",
                  borderRadius: "var(--r-md)",
                  fontSize: "var(--fs-sm)", fontWeight: 500,
                  color: active ? "var(--c-sidebar-text-active)" : "var(--c-sidebar-text)",
                  background: active ? "var(--c-sidebar-active)" : "transparent",
                  transition: "all var(--t-fast)",
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = "var(--c-sidebar-hover)";
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = "transparent";
                }}
              >
                <span style={{ flexShrink: 0, display: "flex", opacity: active ? 1 : 0.6 }}>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Theme toggle */}
        <div style={{ padding: "var(--sp-2)", borderTop: "1px solid var(--c-sidebar-border)" }}>
          <button
            onClick={toggleTheme}
            style={{
              display: "flex", alignItems: "center", gap: "var(--sp-3)",
              padding: "var(--sp-2) var(--sp-3)",
              borderRadius: "var(--r-md)",
              fontSize: "var(--fs-sm)", fontWeight: 500,
              color: "var(--c-sidebar-text)",
              width: "100%",
              transition: "all var(--t-fast)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--c-sidebar-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <span style={{ flexShrink: 0, display: "flex", opacity: 0.6 }}>
              {theme === "dark" ? getIcon("sun") : getIcon("moon")}
            </span>
            {theme === "dark" ? "浅色模式" : "深色模式"}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <Outlet />
      </div>

      <ToastContainer />
    </div>
  );
}

/* ==================== Icons ==================== */

function getIcon(name: string) {
  const props = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  switch (name) {
    case "collab":
      return (
        <svg {...props}>
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
        </svg>
      );
    case "knowledge":
      return (
        <svg {...props}>
          <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
          <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
        </svg>
      );
    case "models":
      return (
        <svg {...props}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M9 9h6M9 15h6M9 12h6" />
        </svg>
      );
    case "mcp":
      return (
        <svg {...props}>
          <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
        </svg>
      );
    case "preferences":
      return (
        <svg {...props}>
          <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
        </svg>
      );
    case "sun":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="5" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      );
    case "moon":
      return (
        <svg {...props}>
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
        </svg>
      );
    default:
      return null;
  }
}
