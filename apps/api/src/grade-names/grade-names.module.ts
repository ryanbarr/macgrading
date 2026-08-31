import { Module } from '@nestjs/common';
import { GradeNamesController } from './grade-names.controller';
import { GradeNamesService } from './grade-names.service';

@Module({
  controllers: [GradeNamesController],
  providers: [GradeNamesService],
})
export class GradeNamesModule {}
