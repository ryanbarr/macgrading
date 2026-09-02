-- AlterTable
ALTER TABLE "Cert" ADD COLUMN     "createdById" TEXT;

-- AddForeignKey
ALTER TABLE "Cert" ADD CONSTRAINT "Cert_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
