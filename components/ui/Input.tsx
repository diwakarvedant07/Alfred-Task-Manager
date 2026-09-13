"use client";

import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";

export default function Input({
  label,
  hideLabel = false,
  icon,
  className = "",
  type = "text",
  id,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hideLabel?: boolean;
  icon?: ReactNode;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  const resolvedType = isPassword && showPassword ? "text" : type;

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <label
        htmlFor={inputId}
        className={hideLabel ? "sr-only" : "font-medium text-[var(--text,#eafcff)]"}
      >
        {label}
      </label>
      <span className="relative flex items-center">
        {icon && (
          <span className="pointer-events-none absolute left-3 flex items-center text-[var(--text,#eafcff)]/50">
            {icon}
          </span>
        )}
        <input
          id={inputId}
          type={resolvedType}
          className={`w-full rounded-lg border border-[var(--text,#eafcff)]/15 bg-[var(--panel-bg,rgba(15,25,35,0.85))] py-2 text-[var(--text,#eafcff)] placeholder:text-[var(--text,#eafcff)]/40 outline-none transition-colors focus:border-[var(--accent,#38e0ff)] ${
            icon ? "pl-9" : "pl-3"
          } ${isPassword ? "pr-9" : "pr-3"} ${className}`}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((s) => !s)}
            className="absolute right-3 flex items-center text-[var(--text,#eafcff)]/50 hover:text-[var(--text,#eafcff)]"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </span>
    </div>
  );
}
