'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { CertDto, CertListDto } from '@macgrading/shared';
import { adminFetch } from '@/lib/admin-api';

export default function AdminCerts() {
  const [q, setQ] = useState('');
  const [showTest, setShowTest] = useState(false);
  const [certs, setCerts] = useState<CertDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ pageSize: '50' });
    if (q.trim()) params.set('q', q.trim());
    if (showTest) params.set('test', 'true');
    const list = await adminFetch<CertListDto>(`/certs/admin/search?${params.toString()}`);
    setCerts(list.items);
  }, [q, showTest]);

  useEffect(() => {
    load().catch((err) => setError(String(err instanceof Error ? err.message : err)));
  }, [load]);

  const voidCert = async (certNumber: string) => {
    const reason = window.prompt(
      `Void ${certNumber}? The number is never reused. Reason (internal note):`,
    );
    if (reason === null) return; // cancelled
    setError(null);
    try {
      await adminFetch(`/certs/${certNumber}/void`, {
        method: 'POST',
        body: reason.trim() ? { reason: reason.trim() } : {},
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Void failed');
    }
  };

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-neutral-900">Certs</h1>

      <div className="flex flex-wrap items-center gap-3">
        <input
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2"
          placeholder="Search name, set, or cert number"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          aria-label="Search certs"
        />
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          <input
            type="checkbox"
            checked={showTest}
            onChange={(event) => setShowTest(event.target.checked)}
          />
          Test certs
        </label>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-300 text-neutral-500">
              <th className="py-2 pr-4">Cert</th>
              <th className="py-2 pr-4">Card</th>
              <th className="py-2 pr-4">Grade</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {certs.map((cert) => (
              <tr key={cert.certNumber} className="border-b border-neutral-200">
                <td className="py-2 pr-4 font-mono">
                  <Link
                    href={`/cert/${cert.certNumber}`}
                    className="text-neutral-900 underline"
                  >
                    {cert.certNumber}
                  </Link>
                </td>
                <td className="py-2 pr-4 text-neutral-600">
                  {cert.cardName}
                  {cert.variants[0] ? ` (${cert.variants[0]})` : ''}
                </td>
                <td className="py-2 pr-4">
                  {cert.grade ?? '—'}
                  {cert.gradeName ? ` · ${cert.gradeName}` : ''}
                </td>
                <td className="py-2 pr-4">
                  {cert.status === 'VOIDED' ? (
                    <span className="font-bold text-red-700">VOIDED</span>
                  ) : (
                    cert.status
                  )}
                </td>
                <td className="py-2">
                  {cert.status !== 'VOIDED' && (
                    <button
                      className="text-red-700 underline"
                      onClick={() => void voidCert(cert.certNumber)}
                    >
                      Void
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {certs.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-neutral-400">
                  No certs found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
