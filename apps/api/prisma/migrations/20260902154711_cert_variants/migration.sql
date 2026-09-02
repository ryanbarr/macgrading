-- AlterTable
ALTER TABLE "Cert" ADD COLUMN     "variants" TEXT[] DEFAULT ARRAY[]::TEXT[];
