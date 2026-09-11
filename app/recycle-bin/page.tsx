import {
  listDeletedItems,
  restoreThread,
  restoreTask,
  emptyRecycleBin,
  RestoreBlockedError,
} from "@/app/actions/recycleBin";

export default async function RecycleBinPage() {
  const { threads, tasks } = await listDeletedItems();

  async function handleRestoreThread(formData: FormData) {
    "use server";
    await restoreThread(String(formData.get("threadId")));
  }

  async function handleRestoreTask(formData: FormData) {
    "use server";
    try {
      await restoreTask(String(formData.get("taskId")));
    } catch (err) {
      // A task whose thread is still DELETED (RestoreBlockedError, from
      // app/actions/recycleBin.ts) can't be restored independently — the
      // thread must be restored first. This simple list page has no
      // per-row error display yet, so swallow rather than crash the whole
      // page on an ordinary click; the row is left as-is in the bin.
      if (!(err instanceof RestoreBlockedError)) throw err;
    }
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
