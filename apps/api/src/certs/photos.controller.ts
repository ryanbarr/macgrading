import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PresignResponseDto } from '@macgrading/shared';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { CheckPolicies } from '../auth/check-policies.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PoliciesGuard } from '../auth/policies.guard';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CertsService } from './certs.service';
import { PresignPhotoDto } from './dto/presign-photo.dto';
import { RegisterPhotoDto } from './dto/register-photo.dto';

@Controller('certs/:certNumber/photos')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class PhotosController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly certs: CertsService,
  ) {}

  private async findCert(certNumber: string) {
    const cert = await this.prisma.cert.findUnique({ where: { certNumber } });
    if (!cert) {
      throw new NotFoundException(`No cert ${certNumber}`);
    }
    return cert;
  }

  @Post('presign')
  @CheckPolicies((ability) => ability.can('create', 'CertPhoto'))
  async presign(
    @Param('certNumber') certNumber: string,
    @Body() dto: PresignPhotoDto,
  ): Promise<PresignResponseDto> {
    const cert = await this.findCert(certNumber);
    const objectKey = `certs/${cert.id}/${randomUUID()}`;
    const uploadUrl = await this.storage.presignPut(objectKey, dto.contentType);
    return { uploadUrl, objectKey };
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', 'CertPhoto'))
  async register(
    @Param('certNumber') certNumber: string,
    @Body() dto: RegisterPhotoDto,
  ) {
    const cert = await this.findCert(certNumber);
    if (!dto.objectKey.startsWith(`certs/${cert.id}/`)) {
      throw new BadRequestException('objectKey does not belong to this cert');
    }
    const contentType = await this.storage.headContentType(dto.objectKey);
    if (contentType === null) {
      throw new BadRequestException('No uploaded object at that key');
    }
    let photo;
    try {
      photo = await this.prisma.certPhoto.create({
        data: {
          certId: cert.id,
          objectKey: dto.objectKey,
          contentType,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('That upload is already registered');
      }
      throw error;
    }
    return {
      id: photo.id,
      url: `${this.certs.publicUrlBase()}/${photo.objectKey}`,
      sortOrder: photo.sortOrder,
    };
  }

  @Delete(':photoId')
  @HttpCode(204)
  @CheckPolicies((ability) => ability.can('delete', 'CertPhoto'))
  async remove(
    @Param('certNumber') certNumber: string,
    @Param('photoId') photoId: string,
  ) {
    const cert = await this.findCert(certNumber);
    const photo = await this.prisma.certPhoto.findFirst({
      where: { id: photoId, certId: cert.id },
    });
    if (!photo) {
      throw new NotFoundException('No such photo on this cert');
    }
    await this.prisma.certPhoto.delete({ where: { id: photo.id } });
    await this.storage.deleteObject(photo.objectKey); // best-effort
  }
}
