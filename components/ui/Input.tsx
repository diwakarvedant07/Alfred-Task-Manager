"use client";

import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { FIELD_CLASSNAME, LABEL_CLASSNAME } from "./fieldStyles";

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
        className={hideLabel ? "sr-only" : LABEL_CLASSNAME}
      >
        {label}
      </label>
      <span className="relative flex items-center">
        {icon && (
          <span className="pointer-events-none absolute left-3 flex items-center text-fg/40">
            {icon}
          </span>
        )}
        <input
          id={inputId}
          type={resolvedType}
          className={`${FIELD_CLASSNAME} h-10 ${
            icon ? "pl-9" : "pl-3"
          } ${isPassword ? "pr-9" : "pr-3"} ${className}`}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((s) => !s)}
            className="absolute right-3 flex items-center text-fg/40 transition-colors hover:text-fg"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </span>
    </div>
  );
}
