"use client";

import { Moon, Sun } from "lucide-react";

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
      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[var(--text,#eafcff)] hover:bg-[var(--text,#eafcff)]/5"
    >
      {value === "DARK" ? <Moon size={16} /> : <Sun size={16} />}
      {value === "DARK" ? "Dark" : "Light"}
    </button>
  );
}
