import type { Metadata } from 'next';
import Link from 'next/link';
import { CertCard } from '@/components/CertCard';
import { listCerts } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Catalog | MAC Grading',
  description: 'Recently graded cards, certified mostly accurately.',
};

const PAGE_SIZE = 12;

interface Props {
  searchParams: Promise<{ q?: string; page?: string; grade?: string }>;
}

const GRADE_CHIPS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

export default async function CatalogPage({ searchParams }: Props) {
  const { q = '', page: rawPage, grade = '' } = await searchParams;
  const page = Math.max(1, Number(rawPage) || 1);
  const list = await listCerts({
    q: q || undefined,
    grade: grade || undefined,
    page,
    pageSize: PAGE_SIZE,
  });
  const totalPages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));

  const buildHref = (overrides: { page?: number; grade?: string }) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    const targetGrade = overrides.grade ?? grade;
    if (targetGrade) params.set('grade', targetGrade);
    if ((overrides.page ?? 1) > 1) params.set('page', String(overrides.page));
    const suffix = params.toString();
    return suffix ? `/catalog?${suffix}` : '/catalog';
  };
  const pageHref = (target: number) => buildHref({ page: target });

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-neutral-900">
          <Link href="/" className="text-neutral-400 hover:text-neutral-600">
            MAC Grading
          </Link>{' '}
          / Catalog
        </h1>
        <form action="/catalog" method="get" className="flex gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search cards…"
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none"
            aria-label="Search the catalog"
          />
          <button
            type="submit"
            className="rounded-lg bg-neutral-700 px-4 py-2 font-semibold text-white hover:bg-neutral-800"
          >
            Search
          </button>
        </form>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-neutral-500">Grade:</span>
        <Link
          href={buildHref({ grade: '' })}
          className={
            grade === ''
              ? 'rounded-full bg-neutral-700 px-3 py-1 font-semibold text-white'
              : 'rounded-full border border-neutral-300 bg-white px-3 py-1 text-neutral-700 hover:border-neutral-500'
          }
        >
          All
        </Link>
        {GRADE_CHIPS.map((chip) => (
          <Link
            key={chip}
            href={buildHref({ grade: chip })}
            className={
              grade === chip
                ? 'rounded-full bg-neutral-700 px-3 py-1 font-semibold text-white'
                : 'rounded-full border border-neutral-300 bg-white px-3 py-1 text-neutral-700 hover:border-neutral-500'
            }
          >
            {chip}
          </Link>
        ))}
      </div>

      <p className="mt-2 text-sm text-neutral-500">
        {list.total} certification{list.total === 1 ? '' : 's'}
        {q ? ` matching "${q}"` : ''}
        {grade ? ` graded ${grade}` : ''}
      </p>

      {list.items.length === 0 ? (
        <p className="mt-16 text-center text-neutral-400">
          Nothing here yet{q ? ` for "${q}"` : ''}.
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.items.map((cert) => (
            <CertCard key={cert.certNumber} cert={cert} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <nav className="mt-8 flex items-center justify-center gap-6 text-neutral-700">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="underline">
              ← Previous
            </Link>
          ) : (
            <span className="text-neutral-300">← Previous</span>
          )}
          <span className="text-sm text-neutral-500">
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={pageHref(page + 1)} className="underline">
              Next →
            </Link>
          ) : (
            <span className="text-neutral-300">Next →</span>
          )}
        </nav>
      )}
    </main>
  );
}
