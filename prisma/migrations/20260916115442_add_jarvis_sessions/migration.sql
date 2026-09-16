/*
  Warnings:

  - Added the required column `sessionId` to the `JarvisMessage` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "JarvisMessage_userId_createdAt_idx";

-- AlterTable
ALTER TABLE "JarvisMessage" ADD COLUMN     "completionTokens" INTEGER,
ADD COLUMN     "promptTokens" INTEGER,
ADD COLUMN     "sessionId" TEXT NOT NULL,
ADD COLUMN     "totalTokens" INTEGER;

-- CreateTable
CREATE TABLE "JarvisSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JarvisSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JarvisSession_userId_updatedAt_idx" ON "JarvisSession"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "JarvisMessage_sessionId_createdAt_idx" ON "JarvisMessage"("sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "JarvisSession" ADD CONSTRAINT "JarvisSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JarvisMessage" ADD CONSTRAINT "JarvisMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "JarvisSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
