import type { CertDto, CertListDto } from '@macgrading/shared';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';
const REVALIDATE_SECONDS = 60;

export async function getCert(certNumber: string): Promise<CertDto | null> {
  // `next.revalidate` is Next.js's fetch extension; vitest compiles this file
  // without Next's type augmentation, so we cast. The property is compile-time
  // invisible but reaches fetch at runtime unchanged.
  const response = await fetch(`${API_URL}/certs/${certNumber}`, {
    next: { revalidate: REVALIDATE_SECONDS },
  } as RequestInit);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`API error ${response.status}`);
  }
  return (await response.json()) as CertDto;
}

export async function listCerts(
  params: { q?: string; page?: number; pageSize?: number } = {},
): Promise<CertListDto> {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  // See getCert for RequestInit cast explanation.
  const response = await fetch(`${API_URL}/certs?${query.toString()}`, {
    next: { revalidate: REVALIDATE_SECONDS },
  } as RequestInit);
  if (!response.ok) {
    throw new Error(`API error ${response.status}`);
  }
  return (await response.json()) as CertListDto;
}
