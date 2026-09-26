import CardMenu from "./CardMenu";

const NOOP = () => {};

export default function ThreadBubbleNode({
  data,
}: {
  id: string;
  data: {
    name: string;
    categoryColor: string;
    // Number of active tasks in this thread — shown so the zoomed-out view
    // still says how much is in each bubble.
    taskCount?: number;
    onRename?: () => void;
    onChangeColor?: () => void;
    onClose?: () => void;
    onDelete?: () => void;
    onViewCatchUp?: () => void;
    // See lib/permissions.ts canManageThreadMeta/canCloseOrDeleteThread —
    // Canvas.tsx computes these from the caller's resolved thread role so
    // the menu doesn't offer actions the server would reject.
    canEditMeta?: boolean;
    canCloseOrDelete?: boolean;
  };
}) {
  return (
    <div
      className="flex cursor-pointer items-center gap-2.5 rounded-full border py-2 pl-3 pr-1.5 text-sm font-semibold text-fg backdrop-blur-md transition-all duration-300 ease-[var(--ease-out-soft)] hover:-translate-y-0.5 hover:scale-[1.03]"
      style={{
        // Bubbles only render in the zoomed-out BUBBLE tier (canvas zoom
        // < 0.6, see zoomTier.ts), where a normally sized pill shrank to
        // unreadable. CSS `zoom` (unlike `transform`) also enlarges the
        // layout box React Flow measures, so the click target matches.
        zoom: 2.2,
        // Tinted with the thread's category color rather than filled solid
        // with it — a solid fill forced dark text onto arbitrary colors.
        background: `color-mix(in srgb, ${data.categoryColor} 18%, var(--surface))`,
        borderColor: `color-mix(in srgb, ${data.categoryColor} 45%, transparent)`,
        boxShadow: `0 10px 30px -12px color-mix(in srgb, ${data.categoryColor} 60%, transparent)`,
      }}
    >
      <span className="relative flex h-2.5 w-2.5">
        <span
          aria-hidden
          className="absolute inset-0 animate-ping rounded-full opacity-40 [animation-duration:2.4s]"
          style={{ background: data.categoryColor }}
        />
        <span aria-hidden className="relative h-2.5 w-2.5 rounded-full" style={{ background: data.categoryColor }} />
      </span>
      <span>{data.name}</span>
      {data.taskCount !== undefined && (
        <span className="rounded-full bg-fg/10 px-1.5 text-[11px] font-medium text-fg/70">{data.taskCount}</span>
      )}
      <CardMenu
        variant="thread"
        onRename={data.onRename ?? NOOP}
        onChangeColor={data.onChangeColor ?? NOOP}
        onClose={data.onClose ?? NOOP}
        onDelete={data.onDelete ?? NOOP}
        onViewCatchUp={data.onViewCatchUp ?? NOOP}
        canEditMeta={data.canEditMeta ?? true}
        canCloseOrDelete={data.canCloseOrDelete ?? true}
      />
    </div>
  );
}
