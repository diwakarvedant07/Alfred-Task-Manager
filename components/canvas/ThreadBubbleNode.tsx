export default function ThreadBubbleNode({
  data,
}: {
  id: string;
  data: { name: string; categoryColor: string };
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
      }}
    >
      {data.name}
    </div>
  );
}
