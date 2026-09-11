"use client";

export default function ThemeToggle({
  value,
  onChange,
}: {
  value: "LIGHT" | "DARK";
  onChange: (mode: "LIGHT" | "DARK") => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={value === "DARK"}
      onClick={() => onChange(value === "DARK" ? "LIGHT" : "DARK")}
    >
      {value === "DARK" ? "🌙 Dark" : "☀️ Light"}
    </button>
  );
}
