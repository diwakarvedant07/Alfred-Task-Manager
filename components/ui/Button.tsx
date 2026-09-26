"use client";

import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "icon";

const BASE =
  "relative inline-flex select-none items-center justify-center gap-2 rounded-xl font-medium whitespace-nowrap " +
  "transition-[background-color,border-color,color,box-shadow,transform,filter] duration-200 ease-out " +
  "active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 " +
  "focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-50";

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  icon: "h-9 w-9 text-sm",
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-on-accent shadow-[0_6px_20px_-8px_var(--accent)] hover:brightness-110 hover:shadow-[0_8px_26px_-8px_var(--accent)]",
  secondary: "border border-fg/12 bg-fg/[0.04] text-fg hover:border-fg/20 hover:bg-fg/[0.08]",
  ghost: "text-fg/70 hover:bg-fg/[0.07] hover:text-fg",
  danger: "bg-red-500/90 text-white hover:bg-red-500",
};

export function buttonClassName(
  variant: ButtonVariant = "primary",
  className = "",
  size: ButtonSize = "md"
): string {
  return `${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${className}`;
}

export default function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}) {
  return (
    <button className={buttonClassName(variant, className, size)} disabled={disabled || loading} {...rest}>
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}
