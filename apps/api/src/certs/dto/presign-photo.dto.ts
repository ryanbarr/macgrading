import { IsIn } from 'class-validator';
import { ALLOWED_PHOTO_TYPES } from '@macgrading/shared';
import type { AllowedPhotoType } from '@macgrading/shared';

export class PresignPhotoDto {
  @IsIn(ALLOWED_PHOTO_TYPES)
  contentType!: AllowedPhotoType;
}
