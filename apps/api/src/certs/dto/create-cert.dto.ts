import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';

export class CreateCertDto {
  @IsString()
  @IsNotEmpty()
  cardboardTensId!: string;

  @IsBoolean()
  isPrototype!: boolean;
}
