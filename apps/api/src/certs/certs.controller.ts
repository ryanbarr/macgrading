import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { defineAbilityFor } from '@macgrading/shared';
import { CheckPolicies } from '../auth/check-policies.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PoliciesGuard } from '../auth/policies.guard';
import { CertsService } from './certs.service';
import { CreateCertDto } from './dto/create-cert.dto';
import { ListCertsQuery } from './dto/list-certs.query';
import { SetGradeDto } from './dto/set-grade.dto';
import { VoidCertDto } from './dto/void-cert.dto';

@Controller('certs')
export class CertsController {
  constructor(private readonly certs: CertsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('create', 'Cert'))
  mint(@Body() dto: CreateCertDto, @CurrentUser() user: User) {
    // Mint-with-grade also grades: require the grade ability the PATCH
    // route demands, so the two gates can never drift apart.
    if (
      dto.grade !== undefined &&
      !defineAbilityFor(user).can('grade', 'Cert')
    ) {
      throw new ForbiddenException('Insufficient permissions to grade');
    }
    return this.certs.mint(dto, user.id);
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

  @Post(':certNumber/void')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('void', 'Cert'))
  void(
    @Param('certNumber') certNumber: string,
    @Body() dto: VoidCertDto,
    @CurrentUser() user: User,
  ) {
    return this.certs.void(certNumber, dto.reason, user.id);
  }

  /** Admin listing: voided certs included. Gated by the void ability so
   *  "can see voided in lists" and "can void" travel together. */
  @Get('admin/search')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('void', 'Cert'))
  adminList(@Query() query: ListCertsQuery) {
    return this.certs.list({ ...query, includeVoided: true });
  }

  @Get()
  list(@Query() query: ListCertsQuery) {
    return this.certs.list(query);
  }

  @Get(':certNumber')
  getByNumber(@Param('certNumber') certNumber: string) {
    return this.certs.getByNumber(certNumber);
  }
}
