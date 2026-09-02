import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { GRADE_MESSAGE, GRADE_PATTERN } from './set-grade.dto';

export class CreateCertDto {
  @IsString()
  @IsNotEmpty()
  cardboardTensId!: string;

  @IsBoolean()
  isPrototype!: boolean;

  /** When present, the cert mints directly to GRADED in the same transaction. */
  @IsOptional()
  @Matches(GRADE_PATTERN, { message: GRADE_MESSAGE })
  grade?: string;
}
