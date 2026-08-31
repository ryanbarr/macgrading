/*
  Warnings:

  - A unique constraint covering the columns `[objectKey]` on the table `CertPhoto` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "CertPhoto_objectKey_key" ON "CertPhoto"("objectKey");
