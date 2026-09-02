-- AlterEnum
ALTER TYPE "CertStatus" ADD VALUE 'VOIDED';

-- AlterTable
ALTER TABLE "Cert" ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedById" TEXT;

-- AddForeignKey
ALTER TABLE "Cert" ADD CONSTRAINT "Cert_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
