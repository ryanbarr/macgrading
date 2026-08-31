import { Injectable } from '@nestjs/common';
import { GradeNameDto } from '@macgrading/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GradeNamesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<GradeNameDto[]> {
    const rows = await this.prisma.gradeName.findMany({
      orderBy: { gradeValue: 'asc' },
    });
    return rows.map((row) => ({
      gradeValue: row.gradeValue.toString(),
      name: row.name,
    }));
  }
}
