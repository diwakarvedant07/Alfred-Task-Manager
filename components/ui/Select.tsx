"use client";

import { useId, type SelectHTMLAttributes, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { FIELD_CLASSNAME, LABEL_CLASSNAME } from "./fieldStyles";

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
        className={hideLabel ? "sr-only" : LABEL_CLASSNAME}
      >
        {label}
      </label>
      <span className="relative flex items-center">
        <select
          id={inputId}
          className={`${FIELD_CLASSNAME} h-10 cursor-pointer appearance-none pl-3 pr-9 ${className}`}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown size={16} className="pointer-events-none absolute right-3 text-fg/40" />
      </span>
    </div>
  );
}
