import Link from 'next/link';
import type { CertDto } from '@macgrading/shared';

export function CertCard({ cert }: { cert: CertDto }) {
  return (
    <Link
      href={`/cert/${cert.certNumber}`}
      className="block rounded-lg border border-neutral-300 bg-white p-4 hover:border-neutral-500"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-sm text-neutral-500">{cert.certNumber}</span>
        {cert.grade && (
          <span className="text-sm font-bold text-neutral-900">
            {cert.grade}
            {cert.gradeName ? ` · ${cert.gradeName}` : ''}
          </span>
        )}
      </div>
      <p className="mt-1 text-lg font-semibold text-neutral-900">{cert.cardName}</p>
      <p className="text-sm text-neutral-500">
        {cert.setName}
        {cert.releaseYear ? ` · ${cert.releaseYear}` : ''}
      </p>
      {cert.photos[0] && (
        // eslint-disable-next-line @next/next/no-img-element -- storage host varies; wireframe phase
        <img
          src={cert.photos[0].url}
          alt={`Slab photo of ${cert.cardName}`}
          className="mt-3 aspect-square w-full rounded object-cover"
        />
      )}
    </Link>
  );
}
