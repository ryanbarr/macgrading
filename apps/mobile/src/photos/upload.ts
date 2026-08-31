import type { CertPhotoDto, PresignResponseDto } from '@macgrading/shared';
import { apiFetch } from '../api/client';

interface UploadArgs {
  certNumber: string;
  token: string;
  uri: string;
  mimeType: string;
  sortOrder: number;
}

/** presign → PUT the local asset's bytes → register. Never registers a failed upload. */
export async function uploadCertPhoto(args: UploadArgs): Promise<CertPhotoDto> {
  const presign = await apiFetch<PresignResponseDto>(
    `/certs/${args.certNumber}/photos/presign`,
    { method: 'POST', body: { contentType: args.mimeType }, token: args.token },
  );

  const asset = await fetch(args.uri);
  const bytes = await asset.blob();
  const put = await fetch(presign.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': args.mimeType },
    body: bytes,
  });
  if (!put.ok) {
    throw new Error(`Upload failed (${put.status})`);
  }

  return apiFetch<CertPhotoDto>(`/certs/${args.certNumber}/photos`, {
    method: 'POST',
    body: { objectKey: presign.objectKey, sortOrder: args.sortOrder },
    token: args.token,
  });
}
