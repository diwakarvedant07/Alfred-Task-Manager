import { listDeletedItems, restoreThread, restoreTask, emptyRecycleBin } from "@/app/actions/recycleBin";

export default async function RecycleBinPage() {
  const { threads, tasks } = await listDeletedItems();

  async function handleRestoreThread(formData: FormData) {
    "use server";
    await restoreThread(String(formData.get("threadId")));
  }

  async function handleRestoreTask(formData: FormData) {
    "use server";
    await restoreTask(String(formData.get("taskId")));
  }

  async function handleEmpty() {
    "use server";
    await emptyRecycleBin();
  }

  return (
    <div>
      <h1>Recycle Bin</h1>
      <p>
        Items here are permanently deleted 30 days after being moved to the bin. Use &quot;Empty Recycle
        Bin&quot; to delete them immediately instead.
      </p>
      <ul>
        {threads.map((t) => (
          <li key={t.id}>
            {t.name} (thread)
            <form action={handleRestoreThread}>
              <input type="hidden" name="threadId" value={t.id} />
              <button type="submit">Restore</button>
            </form>
          </li>
        ))}
        {tasks.map((t) => (
          <li key={t.id}>
            {t.title} (task)
            <form action={handleRestoreTask}>
              <input type="hidden" name="taskId" value={t.id} />
              <button type="submit">Restore</button>
            </form>
          </li>
        ))}
      </ul>
      <form action={handleEmpty}>
        <button type="submit">Empty Recycle Bin</button>
      </form>
    </div>
  );
}
