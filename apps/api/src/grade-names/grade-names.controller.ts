import { Controller, Get, UseGuards } from '@nestjs/common';
import { CheckPolicies } from '../auth/check-policies.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PoliciesGuard } from '../auth/policies.guard';
import { GradeNamesService } from './grade-names.service';

@Controller('grade-names')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class GradeNamesController {
  constructor(private readonly gradeNames: GradeNamesService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', 'GradeName'))
  list() {
    return this.gradeNames.list();
  }
}
