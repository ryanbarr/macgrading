import { Transform, Type } from 'class-transformer';
import { GRADE_PATTERN } from './set-grade.dto';
import {
  IsBoolean,
  Matches,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class ListCertsQuery {
  @IsOptional()
  @IsString()
  q?: string;

  /** Exact grade filter, e.g. "10" — "browse all Mac Daddys". */
  @IsOptional()
  @Matches(GRADE_PATTERN)
  grade?: string;

  /** true → list ONLY training certs; omitted/false → live certs only. */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  test?: boolean;


  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}
