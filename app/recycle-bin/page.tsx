import { listDeletedItems } from "@/app/actions/recycleBin";

export default async function RecycleBinPage() {
  const { threads, tasks } = await listDeletedItems();

  return (
    <div>
      <h1>Recycle Bin</h1>
      <p>
        Items here are permanently deleted 30 days after being moved to the bin. Use &quot;Empty Recycle
        Bin&quot; to delete them immediately instead.
      </p>
      <ul>
        {threads.map((t) => (
          <li key={t.id}>{t.name} (thread)</li>
        ))}
        {tasks.map((t) => (
          <li key={t.id}>{t.title} (task)</li>
        ))}
      </ul>
    </div>
  );
}
