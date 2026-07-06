import { createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { AppShell } from "@/features/app/AppShell";
import { WorkbenchPage } from "@/features/workbench/WorkbenchPage";
import { ModelsPage } from "@/features/models/ModelsPage";
import { KnowledgePage } from "@/features/knowledge/KnowledgePage";
import { McpPage } from "@/features/mcp/McpPage";
import { PreferencesPage } from "@/features/preferences/PreferencesPage";

const rootRoute = createRootRoute({
  component: AppShell,
});

const workbenchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: WorkbenchPage,
});

const modelsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/models",
  component: ModelsPage,
});

const mcpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/mcp",
  component: McpPage,
});

const knowledgeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/knowledge",
  component: KnowledgePage,
});

const preferencesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/preferences",
  component: PreferencesPage,
});

const routeTree = rootRoute.addChildren([
  workbenchRoute,
  modelsRoute,
  mcpRoute,
  knowledgeRoute,
  preferencesRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export function AppRouter() {
  return <RouterProvider router={router} />;
}
