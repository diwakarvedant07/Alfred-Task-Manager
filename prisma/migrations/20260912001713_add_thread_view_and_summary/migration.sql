-- AlterTable
ALTER TABLE "User" ADD COLUMN     "preferredAiModel" TEXT NOT NULL DEFAULT 'gemini-2.5-pro';

-- CreateTable
CREATE TABLE "ThreadView" (
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastViewedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThreadView_pkey" PRIMARY KEY ("threadId","userId")
);

-- CreateTable
CREATE TABLE "ThreadSummary" (
    "threadId" TEXT NOT NULL,
    "summaryText" TEXT NOT NULL,
    "lastIncludedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThreadSummary_pkey" PRIMARY KEY ("threadId")
);

-- AddForeignKey
ALTER TABLE "ThreadView" ADD CONSTRAINT "ThreadView_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadView" ADD CONSTRAINT "ThreadView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadSummary" ADD CONSTRAINT "ThreadSummary_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
