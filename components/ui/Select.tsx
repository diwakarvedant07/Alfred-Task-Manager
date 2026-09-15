"use client";

import { useId, type SelectHTMLAttributes, type ReactNode } from "react";

export default function Select({
  label,
  hideLabel = false,
  className = "",
  id,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hideLabel?: boolean;
  children: ReactNode;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <label
        htmlFor={inputId}
        className={hideLabel ? "sr-only" : "font-medium text-[var(--text,#eafcff)]"}
      >
        {label}
      </label>
      <select
        id={inputId}
        className={`rounded-lg border border-[var(--text,#eafcff)]/15 bg-[var(--panel-bg,rgba(15,25,35,0.85))] px-3 py-2 text-[var(--text,#eafcff)] outline-none transition-colors focus:border-[var(--accent,#38e0ff)] ${className}`}
        {...rest}
      >
        {children}
      </select>
    </div>
  );
}
