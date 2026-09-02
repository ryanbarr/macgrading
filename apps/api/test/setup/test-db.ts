import { PrismaClient, Prisma } from '@prisma/client';

/** Truncates data tables and restores the baseline seed (counters at 1, two grade names). */
export async function resetDb(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "CertPhoto", "Cert", "User", "CertCounter", "GradeName" CASCADE',
  );
  await prisma.certCounter.createMany({
    data: [
      { type: 'STANDARD', nextValue: 1 },
      { type: 'TEST_STANDARD', nextValue: 1 },
      { type: 'TEST_PROTOTYPE', nextValue: 1 },
      { type: 'PROTOTYPE', nextValue: 1 },
    ],
  });
  await prisma.gradeName.createMany({
    data: [
      { gradeValue: new Prisma.Decimal('1'), name: "Lil' Mac" },
      { gradeValue: new Prisma.Decimal('10'), name: 'Mac Daddy' },
    ],
  });
}
