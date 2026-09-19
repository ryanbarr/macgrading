import Link from 'next/link';
import type { CertDto } from '@macgrading/shared';

export function CertCard({ cert }: { cert: CertDto }) {
  const photo = cert.photos[0];

  return (
    <Link
      href={`/cert/${cert.certNumber}`}
      className="group block rounded-[26px] bg-tile p-2.5 transition hover:bg-lavender"
    >
      <div className="relative grid aspect-[4/5] place-items-center rounded-[20px] bg-[radial-gradient(120%_80%_at_50%_30%,#ffffff_0%,#f3f1fb_70%)]">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- storage host varies
          <img
            src={photo.url}
            alt={`Front of ${cert.cardName}`}
            className="absolute inset-0 m-auto h-[82%] w-auto max-w-[86%] rounded-md object-contain shadow-[0_12px_20px_-14px_rgba(60,20,40,0.5)] transition group-hover:-translate-y-0.5"
          />
        ) : (
          <span className="text-xs text-muted">No photo yet</span>
        )}
      </div>
      <div className="px-1.5 pb-1 pt-3">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-[15px] font-bold text-ink">{cert.cardName}</p>
          {cert.grade && (
            <span className="flex-none rounded-full bg-grade px-2 py-0.5 text-xs font-black text-ink">
              {cert.grade}
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted">
          {cert.setName}
          {cert.releaseYear ? ` · ${cert.releaseYear}` : ''}
        </p>
        <p className="mt-1.5 font-mono text-[11px] tracking-wide text-muted">{cert.certNumber}</p>
      </div>
    </Link>
  );
}
