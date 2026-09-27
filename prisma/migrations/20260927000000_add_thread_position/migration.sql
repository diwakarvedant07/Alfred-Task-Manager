-- CreateTable
CREATE TABLE "ThreadPosition" (
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "positionX" DOUBLE PRECISION NOT NULL,
    "positionY" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ThreadPosition_pkey" PRIMARY KEY ("threadId","userId")
);

-- AddForeignKey
ALTER TABLE "ThreadPosition" ADD CONSTRAINT "ThreadPosition_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadPosition" ADD CONSTRAINT "ThreadPosition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
