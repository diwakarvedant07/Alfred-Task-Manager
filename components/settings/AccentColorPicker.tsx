"use client";

export default function AccentColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span>Accent color</span>
      <input
        aria-label="Accent color"
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
