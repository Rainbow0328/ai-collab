import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useTheme } from "@/components/shared/ThemeProvider";

const navItems = [
  { to: "/", label: "Workbench" },
  { to: "/models", label: "Models" },
  { to: "/mcp", label: "MCP" },
  { to: "/knowledge", label: "Knowledge" },
  { to: "/preferences", label: "Preferences" },
] as const;

export function AppShell() {
  const { theme, toggleTheme } = useTheme();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <div className="workbench-shell">
      <aside className="workbench-sidebar">
        <div className="workbench-brand">
          <div className="workbench-brand__mark">A</div>
          <div className="workbench-brand__text">
            <div className="workbench-brand__title">AI Collab</div>
            <div className="workbench-brand__subtitle">Agent Workbench</div>
          </div>
        </div>

        <nav className="workbench-nav" aria-label="Main navigation">
          {navItems.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`workbench-nav__item ${active ? "workbench-nav__item--active" : ""}`}
              >
                <span className="workbench-nav__dot" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="workbench-sidebar__footer">
          <button type="button" onClick={toggleTheme} className="workbench-theme-button">
            Theme: {theme}
          </button>
        </div>
      </aside>

      <div className="workbench-main">
        <Outlet />
      </div>
    </div>
  );
}
