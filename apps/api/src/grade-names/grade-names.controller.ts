import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { GradeNameDto } from '@macgrading/shared';
import { CheckPolicies } from '../auth/check-policies.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PoliciesGuard } from '../auth/policies.guard';
import { PrismaService } from '../prisma/prisma.service';
import { GRADE_PATTERN } from '../certs/dto/set-grade.dto';
import { GradeNamesService } from './grade-names.service';

class SetGradeNameDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string;
}

@Controller('grade-names')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class GradeNamesController {
  constructor(
    private readonly gradeNames: GradeNamesService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', 'GradeName'))
  list() {
    return this.gradeNames.list();
  }

  /** Upsert — renames touch the lookup only; frozen certs keep their copy. */
  @Put(':gradeValue')
  @CheckPolicies((ability) => ability.can('update', 'GradeName'))
  async set(
    @Param('gradeValue') rawValue: string,
    @Body() dto: SetGradeNameDto,
  ): Promise<GradeNameDto> {
    if (!GRADE_PATTERN.test(rawValue)) {
      throw new BadRequestException(
        'gradeValue must be between 1 and 10 with at most one decimal place',
      );
    }
    const gradeValue = new Prisma.Decimal(rawValue);
    const row = await this.prisma.gradeName.upsert({
      where: { gradeValue },
      update: { name: dto.name },
      create: { gradeValue, name: dto.name },
    });
    return { gradeValue: row.gradeValue.toString(), name: row.name };
  }

  @Delete(':gradeValue')
  @HttpCode(204)
  @CheckPolicies((ability) => ability.can('delete', 'GradeName'))
  async remove(@Param('gradeValue') rawValue: string): Promise<void> {
    if (!GRADE_PATTERN.test(rawValue)) {
      throw new BadRequestException('invalid grade value');
    }
    const gradeValue = new Prisma.Decimal(rawValue);
    const existing = await this.prisma.gradeName.findUnique({
      where: { gradeValue },
    });
    if (!existing) {
      throw new NotFoundException('No name configured for that grade');
    }
    await this.prisma.gradeName.delete({ where: { gradeValue } });
  }
}
