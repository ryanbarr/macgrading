import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, CertCounterType } from '@prisma/client';
import {
  CertDto,
  CertListDto,
  formatCertNumber,
  isValidCertNumber,
} from '@macgrading/shared';
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

  async mint(input: CreateCertDto, userId: string): Promise<CertDto> {
    const card = await this.catalog.getById(input.cardboardTensId);
    if (!card) {
      throw new NotFoundException(`Unknown card: ${input.cardboardTensId}`);
    }

    // The snapshot records the ONE variant being slabbed, not the catalog's
    // full list — a choice is mandatory whenever the card offers variants.
    if (card.variants.length > 0) {
      if (!input.variant || !card.variants.includes(input.variant)) {
        throw new BadRequestException(
          `variant must be one of: ${card.variants.join(', ')}`,
        );
      }
    } else if (input.variant) {
      throw new BadRequestException('this card has no variants to choose');
    }

    const isTest = input.isTest ?? false;
    const counterType: CertCounterType = isTest
      ? input.isPrototype
        ? 'TEST_PROTOTYPE'
        : 'TEST_STANDARD'
      : input.isPrototype
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
      const certNumber = formatCertNumber(sequenceValue, input.isPrototype, isTest);
      await tx.certCounter.update({
        where: { type: counterType },
        data: { nextValue: sequenceValue + 1 },
      });

      // Late-minting flow: when the grade is known up front, freeze it in the
      // same transaction so a cert is never observable half-minted.
      let gradeFields: Prisma.CertCreateInput | object = {};
      if (input.grade !== undefined) {
        const gradeValue = new Prisma.Decimal(input.grade);
        const gradeName = await tx.gradeName.findUnique({
          where: { gradeValue },
        });
        gradeFields = {
          status: 'GRADED' as const,
          grade: gradeValue,
          gradeName: gradeName?.name ?? null,
          gradedBy: { connect: { id: userId } },
          gradedAt: new Date(),
        };
      }

      return tx.cert.create({
        data: {
          certNumber,
          isPrototype: input.isPrototype,
          isTest,
          createdBy: { connect: { id: userId } },
          cardboardTensId: card.cardboardTensId,
          cardName: card.cardName,
          setName: card.setName,
          cardNumber: card.cardNumber,
          releaseYear: card.releaseYear,
          category: card.category,
          cardImageUrl: card.cardImageUrl,
          variants: input.variant ? [input.variant] : [],
          ...gradeFields,
        },
        include: { photos: true },
      });
    });

    return toCertDto(cert, this.publicUrlBase());
  }

  async setGrade(
    certNumber: string,
    grade: string,
    userId: string,
  ): Promise<CertDto> {
    const cert = await this.prisma.cert.findUnique({ where: { certNumber } });
    if (!cert) {
      throw new NotFoundException(`No cert ${certNumber}`);
    }
    if (cert.status !== 'PENDING_GRADE') {
      throw new ConflictException(
        cert.status === 'VOIDED'
          ? 'Cert is voided and cannot be graded'
          : 'Cert is already graded; grades are frozen',
      );
    }
    const gradeValue = new Prisma.Decimal(grade);
    const gradeName = await this.prisma.gradeName.findUnique({
      where: { gradeValue },
    });
    const updated = await this.prisma.cert.update({
      where: { certNumber },
      data: {
        status: 'GRADED',
        grade: gradeValue,
        gradeName: gradeName?.name ?? null,
        gradedById: userId,
        gradedAt: new Date(),
      },
      include: { photos: true },
    });
    return toCertDto(updated, this.publicUrlBase());
  }

  async void(
    certNumber: string,
    reason: string | undefined,
    userId: string,
  ): Promise<CertDto> {
    const cert = await this.prisma.cert.findUnique({ where: { certNumber } });
    if (!cert) {
      throw new NotFoundException(`No cert ${certNumber}`);
    }
    if (cert.status === 'VOIDED') {
      throw new ConflictException('Cert is already voided');
    }
    const updated = await this.prisma.cert.update({
      where: { certNumber },
      data: {
        status: 'VOIDED',
        voidedById: userId,
        voidedAt: new Date(),
        voidReason: reason ?? null,
      },
      include: { photos: true },
    });
    return toCertDto(updated, this.publicUrlBase());
  }

  async getByNumber(certNumber: string): Promise<CertDto> {
    if (!isValidCertNumber(certNumber)) {
      throw new NotFoundException(`No cert ${certNumber}`);
    }
    const cert = await this.prisma.cert.findUnique({
      where: { certNumber },
      include: { photos: true },
    });
    if (!cert) {
      throw new NotFoundException(`No cert ${certNumber}`);
    }
    return toCertDto(cert, this.publicUrlBase());
  }

  async list(query: {
    q?: string;
    page: number;
    pageSize: number;
    test?: boolean;
    includeVoided?: boolean;
    grade?: string;
  }): Promise<CertListDto> {
    const where: Prisma.CertWhereInput = {
      // Training certs never appear in the public catalog; they are listed
      // only when explicitly requested (mobile Test Mode). Voided certs are
      // likewise hidden from listings (direct lookup always works) unless
      // explicitly included (web admin).
      isTest: query.test === true,
      ...(query.includeVoided === true ? {} : { status: { not: 'VOIDED' } }),
      ...(query.grade ? { grade: new Prisma.Decimal(query.grade) } : {}),
      ...(query.q
        ? {
            OR: [
              { certNumber: query.q },
              { cardName: { contains: query.q, mode: 'insensitive' } },
              { setName: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.cert.count({ where }),
      this.prisma.cert.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { certNumber: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { photos: true },
      }),
    ]);
    const base = this.publicUrlBase();
    return {
      items: rows.map((row) => toCertDto(row, base)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }
}
