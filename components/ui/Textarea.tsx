"use client";

import { useId, type TextareaHTMLAttributes } from "react";

export default function Textarea({
  label,
  hideLabel = false,
  className = "",
  id,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hideLabel?: boolean;
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
      <textarea
        id={inputId}
        className={`w-full rounded-lg border border-[var(--text,#eafcff)]/15 bg-[var(--panel-bg,rgba(15,25,35,0.85))] px-3 py-2 text-[var(--text,#eafcff)] placeholder:text-[var(--text,#eafcff)]/40 outline-none transition-colors focus:border-[var(--accent,#38e0ff)] ${className}`}
        {...rest}
      />
    </div>
  );
}
