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
      className="flex w-full items-center justify-between gap-2 rounded-lg text-sm text-fg"
    >
      <span className="flex items-center gap-2">
        {value === "DARK" ? <Moon size={16} className="text-fg/60" /> : <Sun size={16} className="text-fg/60" />}
        {value === "DARK" ? "Dark" : "Light"}
      </span>
      <span
        aria-hidden
        className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${value === "DARK" ? "bg-accent" : "bg-fg/20"}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ease-[var(--ease-spring)] ${
            value === "DARK" ? "translate-x-[18px]" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}
