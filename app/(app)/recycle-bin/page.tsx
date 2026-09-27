import { refresh } from "next/cache";
import { Layers, SquareCheck, RotateCcw, Trash2 } from "lucide-react";
import {
  listDeletedItems,
  restoreThread,
  restoreTask,
  emptyRecycleBin,
  RestoreBlockedError,
} from "@/app/actions/recycleBin";
import Button from "@/components/ui/Button";

export const metadata = { title: "Recycle Bin" };

export default async function RecycleBinPage() {
  const { threads, tasks } = await listDeletedItems();
  const deletedThreadIds = new Set(threads.map((t) => t.id));
  const isEmpty = threads.length === 0 && tasks.length === 0;

  // Each handler refreshes the route afterwards — without that, a restored
  // or purged item kept showing in this list until a manual reload.
  async function handleRestoreThread(formData: FormData) {
    "use server";
    await restoreThread(String(formData.get("threadId")));
    refresh();
  }

  async function handleRestoreTask(formData: FormData) {
    "use server";
    try {
      await restoreTask(String(formData.get("taskId")));
    } catch (err) {
      // A task whose thread is still DELETED (RestoreBlockedError, from
      // app/actions/recycleBin.ts) can't be restored independently — the
      // thread must be restored first. The list below already hides the
      // Restore button for those rows; this guards a stale page.
      if (!(err instanceof RestoreBlockedError)) throw err;
    }
    refresh();
  }

  async function handleEmpty() {
    "use server";
    await emptyRecycleBin();
    refresh();
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10 text-fg">
      <div className="flex animate-slide-up flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Recycle Bin</h1>
          <p className="mt-1 max-w-lg text-sm text-fg/55">
            Items here are permanently deleted 30 days after being moved to the bin. Use &quot;Empty Recycle
            Bin&quot; to delete them immediately instead.
          </p>
        </div>
        {!isEmpty && (
          <form action={handleEmpty}>
            <Button type="submit" variant="secondary" size="sm" className="hover:border-red-500/40 hover:text-red-500">
              <Trash2 size={14} />
              Empty Recycle Bin
            </Button>
          </form>
        )}
      </div>

      {isEmpty ? (
        <div className="mt-10 flex animate-rise flex-col items-center gap-3 rounded-3xl border border-dashed border-fg/15 px-6 py-16 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-fg/[0.06] text-fg/50">
            <Trash2 size={22} />
          </span>
          <p className="font-medium">The bin is empty</p>
          <p className="text-sm text-fg/50">Deleted threads and tasks will show up here.</p>
        </div>
      ) : (
        <ul className="mt-8 flex flex-col gap-2">
          {threads.map((t, i) => (
            <li
              key={t.id}
              className="glass flex animate-slide-up items-center gap-3 rounded-2xl px-4 py-3"
              style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                style={{ background: `color-mix(in srgb, ${t.categoryColor} 20%, transparent)`, color: t.categoryColor }}
              >
                <Layers size={16} />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {t.name} <Kind>thread</Kind>
              </span>
              <form action={handleRestoreThread}>
                <input type="hidden" name="threadId" value={t.id} />
                <Button type="submit" variant="ghost" size="sm">
                  <RotateCcw size={14} />
                  Restore
                </Button>
              </form>
            </li>
          ))}
          {tasks.map((t, i) => {
            const blocked = deletedThreadIds.has(t.primaryThreadId);
            return (
              <li
                key={t.id}
                className="glass flex animate-slide-up items-center gap-3 rounded-2xl px-4 py-3"
                style={{ animationDelay: `${Math.min(threads.length + i, 10) * 30}ms` }}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-fg/[0.06] text-fg/60">
                  <SquareCheck size={16} />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {t.title} <Kind>task</Kind>
                </span>
                {blocked ? (
                  <span className="text-xs text-fg/45">Restore its thread first</span>
                ) : (
                  <form action={handleRestoreTask}>
                    <input type="hidden" name="taskId" value={t.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      <RotateCcw size={14} />
                      Restore
                    </Button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Renders as a small badge but keeps "(task)"/"(thread)" in the text
// content, so "Title (task)" still reads (and matches) as one phrase.
function Kind({ children }: { children: string }) {
  return (
    <span className="ml-1 rounded-full bg-fg/[0.07] px-2 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wider text-fg/50">
      <span className="sr-only">(</span>
      {children}
      <span className="sr-only">)</span>
    </span>
  );
}
