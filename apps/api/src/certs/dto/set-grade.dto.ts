import { Matches } from 'class-validator';

/** 1–10, at most one decimal place ("7", "9.5", "10"). */
export const GRADE_PATTERN = /^(10(\.0)?|[1-9](\.\d)?)$/;
export const GRADE_MESSAGE =
  'grade must be between 1 and 10 with at most one decimal place';

export class SetGradeDto {
  @Matches(GRADE_PATTERN, { message: GRADE_MESSAGE })
  grade!: string;
}
