'use client';

import { useCallback, useEffect, useState } from 'react';
import type { GradeNameDto } from '@macgrading/shared';
import { adminFetch } from '@/lib/admin-api';

const WHOLE_GRADES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

export default function AdminGradeNames() {
  const [names, setNames] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const rows = await adminFetch<GradeNameDto[]>('/grade-names');
    const map: Record<string, string> = {};
    for (const row of rows) map[String(Number(row.gradeValue))] = row.name;
    setNames(map);
    setDrafts(map);
  }, []);

  useEffect(() => {
    load().catch((err) => setError(String(err instanceof Error ? err.message : err)));
  }, [load]);

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    }
  };

  return (
    <main className="flex max-w-lg flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Grade names</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Renames apply to future grading only — minted certs keep the name
          frozen on their label.
        </p>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="flex flex-col gap-2">
        {WHOLE_GRADES.map((grade) => {
          const saved = names[grade] ?? '';
          const draft = drafts[grade] ?? '';
          const dirty = draft !== saved;
          return (
            <div key={grade} className="flex items-center gap-3">
              <span className="w-8 text-right font-mono font-bold text-neutral-900">
                {grade}
              </span>
              <input
                className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2"
                placeholder="(no name configured)"
                value={draft}
                onChange={(event) =>
                  setDrafts((current) => ({ ...current, [grade]: event.target.value }))
                }
                aria-label={`Name for grade ${grade}`}
              />
              <button
                className="rounded-lg bg-neutral-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
                disabled={!dirty || draft.trim().length === 0}
                onClick={() =>
                  void run(() =>
                    adminFetch(`/grade-names/${grade}`, {
                      method: 'PUT',
                      body: { name: draft.trim() },
                    }),
                  )
                }
              >
                Save
              </button>
              <button
                className="text-sm text-neutral-500 underline disabled:opacity-40"
                disabled={!saved}
                onClick={() =>
                  void run(() =>
                    adminFetch(`/grade-names/${grade}`, { method: 'DELETE' }),
                  )
                }
              >
                Clear
              </button>
            </div>
          );
        })}
      </div>
    </main>
  );
}
