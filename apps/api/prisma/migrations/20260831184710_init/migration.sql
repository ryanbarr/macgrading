-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'TEAM_MEMBER');

-- CreateEnum
CREATE TYPE "CertStatus" AS ENUM ('PENDING_GRADE', 'GRADED');

-- CreateEnum
CREATE TYPE "CertCounterType" AS ENUM ('STANDARD', 'PROTOTYPE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "googleId" TEXT,
    "role" "Role" NOT NULL DEFAULT 'TEAM_MEMBER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cert" (
    "id" TEXT NOT NULL,
    "certNumber" TEXT NOT NULL,
    "isPrototype" BOOLEAN NOT NULL,
    "status" "CertStatus" NOT NULL DEFAULT 'PENDING_GRADE',
    "cardboardTensId" TEXT NOT NULL,
    "cardName" TEXT NOT NULL,
    "setName" TEXT NOT NULL,
    "cardNumber" TEXT,
    "releaseYear" INTEGER,
    "category" TEXT,
    "cardImageUrl" TEXT,
    "grade" DECIMAL(4,1),
    "gradeName" TEXT,
    "gradedById" TEXT,
    "gradedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertPhoto" (
    "id" TEXT NOT NULL,
    "certId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CertPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertCounter" (
    "type" "CertCounterType" NOT NULL,
    "nextValue" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "CertCounter_pkey" PRIMARY KEY ("type")
);

-- CreateTable
CREATE TABLE "GradeName" (
    "gradeValue" DECIMAL(4,1) NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "GradeName_pkey" PRIMARY KEY ("gradeValue")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "Cert_certNumber_key" ON "Cert"("certNumber");

-- CreateIndex
CREATE INDEX "Cert_createdAt_idx" ON "Cert"("createdAt");

-- CreateIndex
CREATE INDEX "CertPhoto_certId_idx" ON "CertPhoto"("certId");

-- AddForeignKey
ALTER TABLE "Cert" ADD CONSTRAINT "Cert_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertPhoto" ADD CONSTRAINT "CertPhoto_certId_fkey" FOREIGN KEY ("certId") REFERENCES "Cert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
