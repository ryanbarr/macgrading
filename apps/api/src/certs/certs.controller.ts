import { Body, Controller, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CheckPolicies } from '../auth/check-policies.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PoliciesGuard } from '../auth/policies.guard';
import { CertsService } from './certs.service';
import { CreateCertDto } from './dto/create-cert.dto';
import { SetGradeDto } from './dto/set-grade.dto';

@Controller('certs')
export class CertsController {
  constructor(private readonly certs: CertsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('create', 'Cert'))
  mint(@Body() dto: CreateCertDto) {
    return this.certs.mint(dto);
  }

  @Patch(':certNumber/grade')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('grade', 'Cert'))
  setGrade(
    @Param('certNumber') certNumber: string,
    @Body() dto: SetGradeDto,
    @CurrentUser() user: User,
  ) {
    return this.certs.setGrade(certNumber, dto.grade, user.id);
  }
}
