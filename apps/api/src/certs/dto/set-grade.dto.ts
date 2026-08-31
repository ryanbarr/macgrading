import { Matches } from 'class-validator';

export class SetGradeDto {
  /** 1–10, at most one decimal place ("7", "9.5", "10"). */
  @Matches(/^(10(\.0)?|[1-9](\.\d)?)$/, {
    message: 'grade must be between 1 and 10 with at most one decimal place',
  })
  grade!: string;
}
