import { Cert, CertPhoto } from '@prisma/client';
import { CertDto, CertStatus } from '@macgrading/shared';

export function toCertDto(
  cert: Cert & { photos: CertPhoto[] },
  publicUrlBase: string,
): CertDto {
  return {
    certNumber: cert.certNumber,
    isPrototype: cert.isPrototype,
    status: cert.status,
    cardboardTensId: cert.cardboardTensId,
    cardName: cert.cardName,
    setName: cert.setName,
    cardNumber: cert.cardNumber,
    releaseYear: cert.releaseYear,
    category: cert.category,
    cardImageUrl: cert.cardImageUrl,
    grade: cert.grade ? cert.grade.toString() : null,
    gradeName: cert.gradeName,
    gradedAt: cert.gradedAt ? cert.gradedAt.toISOString() : null,
    createdAt: cert.createdAt.toISOString(),
    photos: [...cert.photos]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((photo) => ({
        id: photo.id,
        url: `${publicUrlBase}/${photo.objectKey}`,
        sortOrder: photo.sortOrder,
      })),
  };
}
