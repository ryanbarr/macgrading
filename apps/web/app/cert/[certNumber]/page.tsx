import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { isValidCertNumber } from '@macgrading/shared';
import { ShareCertButton } from '@/components/ShareCertButton';
import { SiteNav } from '@/components/SiteNav';
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
    color: { dark: '#111114', light: '#ffffff' },
  });

  const formatDate = (iso: string, month: 'long' | 'short') =>
    new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month,
      day: 'numeric',
    });
  const gradedDate = cert.gradedAt ? formatDate(cert.gradedAt, 'short') : null;
  const details = [
    cert.setName,
    cert.cardNumber,
    cert.releaseYear?.toString(),
  ].filter(Boolean);
  const photo = cert.photos[0];

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-5 md:px-8 md:py-10">
      <div className="rounded-[36px] bg-white p-[18px] shadow-[0_20px_40px_-24px_rgba(17,17,20,0.25)] md:p-8">
        <SiteNav />

        {cert.voidedAt && (
          <div className="mt-4 rounded-3xl border border-red-200 bg-red-50 p-4 text-center text-red-700">
            <p className="text-lg font-black tracking-wide">VOIDED</p>
            <p className="mt-1 text-sm">
              This certification was voided by MAC Grading on{' '}
              {formatDate(cert.voidedAt, 'long')} and is no longer valid. The number
              will never be reused.
            </p>
          </div>
        )}

        <div className="mt-4 grid gap-5 md:mt-6 md:grid-cols-2 md:items-start md:gap-10">
          <section className="grid place-items-center rounded-[26px] bg-[radial-gradient(120%_80%_at_50%_30%,#ffffff_0%,#f3f1fb_70%)] px-6 py-6 md:py-10">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element -- storage host varies
              <img
                src={photo.url}
                alt={`Front of ${cert.cardName}`}
                className="w-[58%] max-w-xs rounded-[10px] shadow-[0_18px_30px_-18px_rgba(60,20,40,0.45)] md:w-[72%]"
              />
            ) : (
              <p className="py-16 text-sm text-muted">Photo coming soon.</p>
            )}
          </section>

          <section>
            {details.length > 0 && (
              <p className="text-[13px] font-medium text-muted">{details.join(' · ')}</p>
            )}
            <h1 className="mt-0.5 text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
              {cert.cardName}
            </h1>
            <div className="mt-2.5 flex flex-wrap gap-1.5 text-xs font-semibold">
              {cert.variants.map((variant) => (
                <span key={variant} className="rounded-full bg-lime px-2.5 py-1 text-ink">
                  {variant}
                </span>
              ))}
              {cert.category && (
                <span className="rounded-full bg-tile px-2.5 py-1 text-ink">{cert.category}</span>
              )}
              {cert.isTest && (
                <span className="rounded-full bg-coral px-2.5 py-1 text-white">Test cert</span>
              )}
              {cert.isPrototype && (
                <span className="rounded-full bg-ink px-2.5 py-1 text-white">Prototype</span>
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <div
                className={`row-span-2 flex min-h-[170px] flex-col justify-between rounded-[22px] p-3.5 ${
                  cert.grade ? 'bg-grade' : 'bg-lavender'
                } ${cert.voidedAt ? 'grayscale' : ''}`}
              >
                <div className="flex items-center justify-between text-xs font-bold text-ink">
                  <span>Grade</span>
                  <span className="rounded-full bg-white/75 px-2 py-0.5">
                    {cert.voidedAt ? 'Voided' : cert.grade ? 'Certified' : 'Pending'}
                  </span>
                </div>
                {cert.grade ? (
                  <div>
                    <p className="text-[68px] font-black leading-[0.9] tracking-tighter text-ink">
                      {cert.grade}
                    </p>
                    {cert.gradeName && (
                      <span className="mt-2 inline-block rounded-full bg-ink px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-white">
                        {cert.gradeName}
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-lg font-bold text-ink">Awaiting grade</p>
                )}
              </div>
              <div className="rounded-[22px] bg-tile p-3.5">
                <p className="text-xs font-medium text-muted">Cert number</p>
                <p className="mt-1 font-mono text-[15px] font-bold tracking-wide text-ink">
                  {cert.certNumber}
                </p>
              </div>
              <div className="rounded-[22px] bg-tile p-3.5">
                <p className="text-xs font-medium text-muted">Graded</p>
                <p className="mt-1 text-[15px] font-bold text-ink">{gradedDate ?? 'Not yet'}</p>
              </div>
              <div className="col-span-2 flex items-center gap-3 rounded-[22px] bg-tile p-3.5">
                {/* eslint-disable-next-line @next/next/no-img-element -- data URI QR */}
                <img
                  src={qrDataUrl}
                  alt={`QR code linking to certification ${cert.certNumber}`}
                  className="h-[58px] w-[58px] flex-none rounded-xl border border-line bg-white p-1"
                />
                <div>
                  {cert.voidedAt ? (
                    <span className="inline-flex rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">
                      Registration voided
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-lime px-2.5 py-1 text-xs font-bold text-ink">
                      ✓ Registered
                    </span>
                  )}
                  <p className="mt-1.5 text-xs leading-snug text-muted">
                    Scanning the slab&apos;s QR always lands here.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <ShareCertButton
                url={certUrl}
                title={`${cert.cardName} — MAC Grading cert ${cert.certNumber}`}
              />
            </div>
          </section>
        </div>

        <p className="mt-6 text-center text-[11px] text-muted">
          This certification is mostly accurate. The grade was determined by dice.
        </p>
      </div>
    </main>
  );
}
