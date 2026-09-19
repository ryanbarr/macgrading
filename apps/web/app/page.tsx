import Link from 'next/link';
import type { CertDto } from '@macgrading/shared';
import { CertCard } from '@/components/CertCard';
import { CertSearchBox } from '@/components/CertSearchBox';
import { SiteNav } from '@/components/SiteNav';
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
    <main className="mx-auto w-full max-w-5xl px-4 py-5 md:px-8 md:py-10">
      <div className="rounded-[36px] bg-white p-[18px] shadow-[0_20px_40px_-24px_rgba(17,17,20,0.25)] md:p-8">
        <SiteNav showSearch={false} />

        <section className="mt-4 rounded-[30px] bg-grade px-5 pb-6 pt-5 md:mt-6 md:px-10 md:pb-10 md:pt-8">
          <span className="inline-block rounded-full bg-white/75 px-3 py-1 text-xs font-bold text-ink">
            Mostly Accurate Certifications
          </span>
          <h1 className="mt-4 max-w-xl text-4xl font-extrabold leading-[1.05] tracking-tight text-ink md:text-6xl">
            Your card, your dice roll, your grade.
          </h1>
          <div className="mt-6 md:mt-8">
            <CertSearchBox autoFocus />
            <p className="mt-2.5 px-2 text-[13px] font-medium text-ink/70">
              Scan the QR on your slab or type its nine-digit cert number.
            </p>
          </div>
        </section>

        {recent.length > 0 && (
          <section className="mt-8 md:mt-10">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-xl font-extrabold tracking-tight text-ink">Recently graded</h2>
              <Link href="/catalog" className="text-sm font-semibold text-muted hover:text-ink">
                See all →
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
              {recent.map((cert) => (
                <CertCard key={cert.certNumber} cert={cert} />
              ))}
            </div>
          </section>
        )}

        <p className="mt-6 text-center text-[11px] text-muted">
          Every certification is mostly accurate. Grades are determined by dice.
        </p>
      </div>
    </main>
  );
}
