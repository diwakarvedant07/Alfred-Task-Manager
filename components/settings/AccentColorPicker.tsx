"use client";

export default function AccentColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-sm text-fg">
      <span>Accent color</span>
      <input
        aria-label="Accent color"
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-10 cursor-pointer rounded-lg border border-fg/15 bg-transparent p-0.5"
      />
    </label>
  );
}
