import { IsIn } from 'class-validator';

export const ALLOWED_PHOTO_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
] as const;

export class PresignPhotoDto {
  @IsIn(ALLOWED_PHOTO_TYPES)
  contentType!: (typeof ALLOWED_PHOTO_TYPES)[number];
}
