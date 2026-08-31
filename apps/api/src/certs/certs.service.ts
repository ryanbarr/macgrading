import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CertCounterType } from '@prisma/client';
import { CertDto, formatCertNumber } from '@macgrading/shared';
import { CardCatalogService } from '../cards/card-catalog.service';
import { PrismaService } from '../prisma/prisma.service';
import { toCertDto } from './cert.serializer';
import { CreateCertDto } from './dto/create-cert.dto';

@Injectable()
export class CertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CardCatalogService,
    private readonly config: ConfigService,
  ) {}

  publicUrlBase(): string {
    const base =
      this.config.get<string>('S3_PUBLIC_URL') ??
      this.config.getOrThrow<string>('S3_ENDPOINT');
    const bucket = this.config.getOrThrow<string>('S3_BUCKET');
    return `${base.replace(/\/$/, '')}/${bucket}`;
  }

  async mint(input: CreateCertDto): Promise<CertDto> {
    const card = await this.catalog.getById(input.cardboardTensId);
    if (!card) {
      throw new NotFoundException(`Unknown card: ${input.cardboardTensId}`);
    }

    const counterType: CertCounterType = input.isPrototype
      ? 'PROTOTYPE'
      : 'STANDARD';

    const cert = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ nextValue: number }>>`
        SELECT "nextValue" FROM "CertCounter"
        WHERE "type" = CAST(${counterType} AS "CertCounterType")
        FOR UPDATE
      `;
      if (rows.length === 0) {
        throw new Error(
          `Cert counter row missing for type ${counterType} — run the database seed`,
        );
      }
      const sequenceValue = rows[0].nextValue;
      const certNumber = formatCertNumber(sequenceValue, input.isPrototype);
      await tx.certCounter.update({
        where: { type: counterType },
        data: { nextValue: sequenceValue + 1 },
      });
      return tx.cert.create({
        data: {
          certNumber,
          isPrototype: input.isPrototype,
          cardboardTensId: card.cardboardTensId,
          cardName: card.cardName,
          setName: card.setName,
          cardNumber: card.cardNumber,
          releaseYear: card.releaseYear,
          category: card.category,
          cardImageUrl: card.cardImageUrl,
        },
        include: { photos: true },
      });
    });

    return toCertDto(cert, this.publicUrlBase());
  }
}
