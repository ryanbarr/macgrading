import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class RegisterPhotoDto {
  @IsString()
  @IsNotEmpty()
  objectKey!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
