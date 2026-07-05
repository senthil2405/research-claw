-- AlterTable
ALTER TABLE "ChatSession" ADD COLUMN     "tokensUsed" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Highlight" ADD COLUMN     "tokensUsed" INTEGER NOT NULL DEFAULT 0;
