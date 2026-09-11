import CardMenu from "./CardMenu";

const NOOP = () => {};

export default function ThreadBubbleNode({
  data,
}: {
  id: string;
  data: {
    name: string;
    categoryColor: string;
    onRename?: () => void;
    onChangeColor?: () => void;
    onClose?: () => void;
    onDelete?: () => void;
    // See lib/permissions.ts canManageThreadMeta/canCloseOrDeleteThread —
    // Canvas.tsx computes these from the caller's resolved thread role so
    // the menu doesn't offer actions the server would reject.
    canEditMeta?: boolean;
    canCloseOrDelete?: boolean;
  };
}) {
  return (
    <div
      style={{
        background: data.categoryColor,
        borderRadius: 17,
        padding: "8px 16px",
        fontWeight: 700,
        fontSize: 12,
        boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <span>{data.name}</span>
      <CardMenu
        variant="thread"
        onRename={data.onRename ?? NOOP}
        onChangeColor={data.onChangeColor ?? NOOP}
        onClose={data.onClose ?? NOOP}
        onDelete={data.onDelete ?? NOOP}
        canEditMeta={data.canEditMeta ?? true}
        canCloseOrDelete={data.canCloseOrDelete ?? true}
      />
    </div>
  );
}
