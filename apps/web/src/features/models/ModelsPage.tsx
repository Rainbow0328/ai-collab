import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export function ModelsPage() {
  const modelsQuery = useQuery({
    queryKey: ["models"],
    queryFn: () => api.models.list(),
  });

  const models = modelsQuery.data ?? [];

  return (
    <>
      <header className="workbench-topbar">
        <div>
          <div className="text-sm font-semibold" style={{ color: "var(--color-text-secondary)" }}>Configuration</div>
          <h1 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>Models</h1>
        </div>
        <button className="btn-secondary rounded-md border px-4 py-2 text-sm" onClick={() => void modelsQuery.refetch()}>
          Refresh
        </button>
      </header>
      <main className="workbench-content overflow-auto p-4">
        <section className="panel">
          <div className="panel__header">
            <h2 className="panel__title">Configured Models</h2>
            <span className="text-sm" style={{ color: "var(--color-text-tertiary)" }}>{models.length} models</span>
          </div>
          <div className="panel__body">
            {modelsQuery.isLoading ? (
              <EmptyText text="Loading models..." />
            ) : models.length === 0 ? (
              <EmptyText text="No model configuration found. Configure models from the backend model config source first." />
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {models.map((model) => (
                  <article key={model.id} className="rounded-md border p-4" style={{ borderColor: "var(--color-border)", background: "var(--color-bg)" }}>
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-bold" style={{ color: "var(--color-text-primary)" }}>{model.name}</h3>
                        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{model.provider}</p>
                      </div>
                      <span className="badge badge-active">ready</span>
                    </div>
                    <dl className="grid gap-2 text-sm">
                      <Row label="Model ID" value={model.modelId} />
                      <Row label="Config ID" value={model.id} />
                    </dl>
                  </article>
                ))}
              </div>
            )}
            {modelsQuery.error && <ErrorText text={modelsQuery.error.message} />}
          </div>
        </section>
      </main>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold" style={{ color: "var(--color-text-tertiary)" }}>{label}</dt>
      <dd className="overflow-wrap-anywhere" style={{ color: "var(--color-text-primary)" }}>{value}</dd>
    </div>
  );
}

function EmptyText({ text }: { text: string }) {
  return <div className="rounded-md border border-dashed p-8 text-center text-sm" style={{ borderColor: "var(--color-border)", color: "var(--color-text-tertiary)" }}>{text}</div>;
}

function ErrorText({ text }: { text: string }) {
  return <p className="mt-3 text-sm" style={{ color: "var(--color-error)" }}>{text}</p>;
}
