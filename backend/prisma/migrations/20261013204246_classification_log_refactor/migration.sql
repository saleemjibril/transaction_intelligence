/*
  Warnings:

  - You are about to drop the column `correctedAt` on the `ClassificationLog` table. All the data in the column will be lost.
  - You are about to drop the column `correctedBy` on the `ClassificationLog` table. All the data in the column will be lost.
  - You are about to drop the column `correctedCategory` on the `ClassificationLog` table. All the data in the column will be lost.
  - You are about to drop the column `originalCategory` on the `ClassificationLog` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ClassificationLog" DROP COLUMN "correctedAt",
DROP COLUMN "correctedBy",
DROP COLUMN "correctedCategory",
DROP COLUMN "originalCategory",
ADD COLUMN     "actorId" TEXT,
ADD COLUMN     "category" "TransactionCategory",
ADD COLUMN     "previousCategory" "TransactionCategory";
