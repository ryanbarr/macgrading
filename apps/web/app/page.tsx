import type { CertDto } from '@macgrading/shared';
import { CertCard } from '@/components/CertCard';
import { CertSearchBox } from '@/components/CertSearchBox';
import { listCerts } from '@/lib/api';

async function recentCerts(): Promise<CertDto[]> {
  try {
    const list = await listCerts({ pageSize: 6 });
    return list.items;
  } catch {
    return []; // API unreachable — landing still renders
  }
}

export default async function Home() {
  const recent = await recentCerts();

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col items-center px-6 py-16">
      <h1 className="text-5xl font-black tracking-tight text-neutral-900">
        MAC Grading
      </h1>
      <p className="mt-2 text-lg text-neutral-500">
        Mostly Accurate Certifications — your card, your dice roll, your grade.
      </p>

      <div className="mt-10 w-full max-w-xl">
        <CertSearchBox autoFocus />
        <p className="mt-2 text-center text-sm text-neutral-400">
          Scan the QR on your slab or type its nine-digit cert number.
        </p>
      </div>

      {recent.length > 0 && (
        <section className="mt-16 w-full">
          <h2 className="mb-4 text-xl font-bold text-neutral-900">Recently graded</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((cert) => (
              <CertCard key={cert.certNumber} cert={cert} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
