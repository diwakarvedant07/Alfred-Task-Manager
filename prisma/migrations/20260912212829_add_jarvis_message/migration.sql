-- CreateEnum
CREATE TYPE "JarvisMessageRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateTable
CREATE TABLE "JarvisMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "JarvisMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "toolCalls" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JarvisMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JarvisMessage_userId_createdAt_idx" ON "JarvisMessage"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "JarvisMessage" ADD CONSTRAINT "JarvisMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
