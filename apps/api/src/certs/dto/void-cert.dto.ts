import { IsOptional, IsString, MaxLength } from 'class-validator';

export class VoidCertDto {
  /** Internal audit note — never exposed on the public cert page. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
