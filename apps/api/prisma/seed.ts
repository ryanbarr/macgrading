import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  for (const type of [
    'STANDARD',
    'PROTOTYPE',
    'TEST_STANDARD',
    'TEST_PROTOTYPE',
  ] as const) {
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

  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);
  for (const email of adminEmails) {
    await prisma.user.upsert({
      where: { email },
      update: { role: 'ADMIN', isActive: true },
      create: { email, name: email, role: 'ADMIN' },
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
