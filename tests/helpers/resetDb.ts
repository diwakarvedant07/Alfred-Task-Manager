import { db } from "@/lib/db";

export async function resetDb() {
  await db.taskUpdate.deleteMany();
  await db.taskPosition.deleteMany();
  await db.threadPosition.deleteMany();
  await db.taskThreadLink.deleteMany();
  await db.threadShare.deleteMany();
  await db.threadView.deleteMany();
  await db.threadSummary.deleteMany();
  await db.task.deleteMany();
  await db.thread.deleteMany();
  await db.jarvisMessage.deleteMany();
  await db.jarvisSession.deleteMany();
  await db.user.deleteMany();
}
