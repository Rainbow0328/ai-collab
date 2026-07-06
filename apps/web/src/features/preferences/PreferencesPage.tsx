import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api-client";

const preferencesKey = ["user-preferences"] as const;

export function PreferencesPage() {
  const queryClient = useQueryClient();
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [category, setCategory] = useState("general");
  const [query, setQuery] = useState("");

  const preferencesQuery = useQuery({
    queryKey: [...preferencesKey, query],
    queryFn: () => api.userPreferences.list({ ...(query.trim() ? { query: query.trim() } : {}) }),
  });

  const savePreference = useMutation({
    mutationFn: () => api.userPreferences.upsert(key.trim(), {
      value: value.trim(),
      category: category.trim() || null,
      source: "manual",
    }),
    onSuccess: () => {
      setKey("");
      setValue("");
      void queryClient.invalidateQueries({ queryKey: preferencesKey });
    },
  });

  const deletePreference = useMutation({
    mutationFn: (targetKey: string) => api.userPreferences.delete(targetKey),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: preferencesKey }),
  });

  const preferences = preferencesQuery.data?.preferences ?? [];
  const manifest = preferencesQuery.data?.manifest ?? null;

  return (
    <>
      <header className="workbench-topbar">
        <div>
          <div className="text-sm font-semibold" style={{ color: "var(--color-text-secondary)" }}>Global Memory</div>
          <h1 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>User Preferences</h1>
        </div>
        <input
          className="control-input min-w-[280px]"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search preferences..."
        />
      </header>

      <main className="workbench-content overflow-auto p-4">
        <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
          <section className="panel">
            <div className="panel__header">
              <h2 className="panel__title">Add Preference</h2>
            </div>
            <div className="panel__body space-y-4">
              <Field label="Key">
                <input className="control-input w-full" value={key} onChange={(event) => setKey(event.target.value)} placeholder="coding.style" />
              </Field>
              <Field label="Category">
                <input className="control-input w-full" value={category} onChange={(event) => setCategory(event.target.value)} placeholder="general" />
              </Field>
              <Field label="Preference">
                <textarea
                  className="control-input min-h-[140px] w-full resize-y"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder="Prefer concise Chinese summaries after implementation..."
                />
              </Field>
              <button
                className="btn-primary rounded-md border px-4 py-2 text-sm font-semibold disabled:opacity-50"
                disabled={!key.trim() || !value.trim() || savePreference.isPending}
                onClick={() => savePreference.mutate()}
              >
                {savePreference.isPending ? "Saving..." : "Save Preference"}
              </button>
              {savePreference.error && <ErrorText text={savePreference.error.message} />}
            </div>
          </section>

          <section className="panel">
            <div className="panel__header">
              <div>
                <h2 className="panel__title">Global Preferences</h2>
                {manifest && (
                  <div className="mt-1 text-xs" style={{ color: "var(--color-text-tertiary)" }}>
                    {manifest.count} records · {manifest.rootPath}
                  </div>
                )}
              </div>
            </div>
            <div className="panel__body">
              {preferencesQuery.isLoading ? (
                <EmptyText text="Loading preferences..." />
              ) : preferences.length === 0 ? (
                <EmptyText text="No global user preferences yet." />
              ) : (
                <div className="space-y-3">
                  {preferences.map((item) => (
                    <article key={item.id} className="rounded-md border p-4" style={{ borderColor: "var(--color-border)", background: "var(--color-bg)" }}>
                      <div className="mb-2 flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h3 className="text-base font-bold" style={{ color: "var(--color-text-primary)" }}>{item.key}</h3>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {item.category && <span className="badge badge-working">{item.category}</span>}
                            <span className="badge badge-offline">{item.source}</span>
                          </div>
                        </div>
                        <button className="btn-secondary rounded-md border px-3 py-1.5 text-xs" onClick={() => deletePreference.mutate(item.key)}>
                          Delete
                        </button>
                      </div>
                      <p className="message-text">{item.value}</p>
                    </article>
                  ))}
                </div>
              )}
              {preferencesQuery.error && <ErrorText text={preferencesQuery.error.message} />}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold" style={{ color: "var(--color-text-secondary)" }}>{label}</span>
      {children}
    </label>
  );
}

function EmptyText({ text }: { text: string }) {
  return <div className="rounded-md border border-dashed p-8 text-center text-sm" style={{ borderColor: "var(--color-border)", color: "var(--color-text-tertiary)" }}>{text}</div>;
}

function ErrorText({ text }: { text: string }) {
  return <p className="mt-3 text-sm" style={{ color: "var(--color-error)" }}>{text}</p>;
}
