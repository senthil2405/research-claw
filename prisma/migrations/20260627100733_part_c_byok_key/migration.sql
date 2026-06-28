-- AlterTable
ALTER TABLE "User" ADD COLUMN "anthropicKeyEnc" TEXT;
ALTER TABLE "User" ADD COLUMN "anthropicKeyLast4" TEXT;
ALTER TABLE "User" ADD COLUMN "anthropicKeyUpdatedAt" DATETIME;
