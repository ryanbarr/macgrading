import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { isValidCertNumber } from '@macgrading/shared';
import { ShareCertButton } from '@/components/ShareCertButton';
import { getCert } from '@/lib/api';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

interface Props {
  params: Promise<{ certNumber: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { certNumber } = await params;
  if (!isValidCertNumber(certNumber)) {
    return { title: 'Certification lookup | MAC Grading' };
  }
  const cert = await getCert(certNumber).catch(() => null);
  if (!cert) {
    return { title: 'Certification lookup | MAC Grading' };
  }
  const gradePart = cert.grade
    ? ` — MAC ${cert.grade}${cert.gradeName ? ` ${cert.gradeName}` : ''}`
    : '';
  const title = `${cert.cardName}${gradePart}${cert.voidedAt ? ' (VOIDED)' : ''}`;
  return {
    title: `${title} | MAC Grading`,
    description: `${cert.cardName} (${cert.setName}) — MAC Grading certification ${cert.certNumber}.`,
    openGraph: {
      title,
      description: `Certification ${cert.certNumber} · ${cert.setName}`,
      images: cert.photos[0] ? [cert.photos[0].url] : undefined,
    },
  };
}

export default async function CertPage({ params }: Props) {
  const { certNumber } = await params;
  if (!isValidCertNumber(certNumber)) {
    notFound();
  }
  const cert = await getCert(certNumber);
  if (!cert) {
    notFound();
  }

  const certUrl = `${SITE_URL}/cert/${cert.certNumber}`;
  const qrDataUrl = await QRCode.toDataURL(certUrl, {
    margin: 1,
    width: 192,
    color: { dark: '#171717', light: '#ffffff' },
  });

  const gradedDate = cert.gradedAt
    ? new Date(cert.gradedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      {cert.voidedAt && (
        <div className="mb-6 rounded-lg border-2 border-red-700 bg-red-50 p-4 text-center">
          <p className="text-xl font-black tracking-wide text-red-700">VOIDED</p>
          <p className="mt-1 text-sm text-red-700">
            This certification was voided by MAC Grading on{' '}
            {new Date(cert.voidedAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}{' '}
            and is no longer valid. The number will never be reused.
          </p>
        </div>
      )}
      <div className="rounded-xl border-2 border-neutral-900 bg-white p-6">
        <div className="flex items-start justify-between">
          <p className="text-xs font-black tracking-[0.3em] text-neutral-900">
            MAC GRADING
          </p>
          <span className="flex gap-2">
            {cert.isTest && (
              <span className="rounded bg-red-700 px-2 py-0.5 text-xs font-bold text-white">
                TEST CERT
              </span>
            )}
            {cert.isPrototype && (
              <span className="rounded bg-neutral-900 px-2 py-0.5 text-xs font-bold text-white">
                PROTOTYPE
              </span>
            )}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900">{cert.cardName}</h1>
            <p className="text-neutral-500">
              {cert.setName}
              {cert.cardNumber ? ` · ${cert.cardNumber}` : ''}
              {cert.releaseYear ? ` · ${cert.releaseYear}` : ''}
            </p>
            {cert.variants.length > 0 && (
              <p className="text-sm font-semibold text-neutral-600">
                {cert.variants.join(' · ')}
              </p>
            )}
            {cert.category && <p className="text-sm text-neutral-400">{cert.category}</p>}
          </div>
          <div className="text-right">
            {cert.grade ? (
              <>
                <p className="text-5xl font-black text-neutral-900">{cert.grade}</p>
                {cert.gradeName && (
                  <p className="text-sm font-bold uppercase tracking-wide text-neutral-600">
                    {cert.gradeName}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-neutral-400">Awaiting grade</p>
            )}
          </div>
        </div>

        <div className="mt-6 border-t border-neutral-200 pt-4 text-sm text-neutral-500">
          <p>
            Certification <span className="font-mono text-neutral-900">{cert.certNumber}</span>
          </p>
          {gradedDate && <p>Graded {gradedDate}</p>}
        </div>
      </div>

      <section className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-neutral-200 bg-white p-4">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URI QR */}
          <img
            src={qrDataUrl}
            alt={`QR code linking to certification ${cert.certNumber}`}
            className="h-24 w-24 rounded border border-neutral-200"
          />
          <div className="text-sm">
            {!cert.voidedAt ? (
              <p className="font-semibold text-neutral-900">
                ✓ Registered with MAC Grading
              </p>
            ) : (
              <p className="font-semibold text-red-700">Registration voided</p>
            )}
            <p className="text-neutral-500">
              {gradedDate
                ? `Certified ${gradedDate}`
                : 'Certification in progress'}
            </p>
            <p className="text-neutral-400">
              Scanning the slab&apos;s QR always lands here.
            </p>
          </div>
        </div>
        <ShareCertButton
          url={certUrl}
          title={`${cert.cardName} — MAC Grading cert ${cert.certNumber}`}
        />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold text-neutral-900">Slab photos</h2>
        {cert.photos.length === 0 ? (
          <p className="text-neutral-400">Photos coming soon.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {cert.photos.map((photo) => (
              // eslint-disable-next-line @next/next/no-img-element -- storage host varies; wireframe phase
              <img
                key={photo.id}
                src={photo.url}
                alt={`Slab photo of ${cert.cardName}`}
                className="w-full rounded-lg border border-neutral-200"
              />
            ))}
          </div>
        )}
      </section>

      <p className="mt-10 text-center text-xs text-neutral-400">
        This certification is mostly accurate. The grade was determined by dice.
      </p>
    </main>
  );
}
