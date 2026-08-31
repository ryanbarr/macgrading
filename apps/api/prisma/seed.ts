import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  for (const type of ['STANDARD', 'PROTOTYPE'] as const) {
    await prisma.certCounter.upsert({
      where: { type },
      update: {},
      create: { type, nextValue: 1 },
    });
  }

  const gradeNames: Array<{ gradeValue: string; name: string }> = [
    { gradeValue: '1', name: "Lil' Mac" },
    { gradeValue: '10', name: 'Mac Daddy' },
  ];
  for (const { gradeValue, name } of gradeNames) {
    await prisma.gradeName.upsert({
      where: { gradeValue: new Prisma.Decimal(gradeValue) },
      update: { name },
      create: { gradeValue: new Prisma.Decimal(gradeValue), name },
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
