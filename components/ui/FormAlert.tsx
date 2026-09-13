import { AlertCircle, CheckCircle2 } from "lucide-react";

export default function FormAlert({
  variant = "error",
  children,
}: {
  variant?: "error" | "success";
  children: React.ReactNode;
}) {
  const Icon = variant === "error" ? AlertCircle : CheckCircle2;
  const borderAndBg =
    variant === "error" ? "border-red-500/30 bg-red-500/10" : "border-emerald-500/30 bg-emerald-500/10";
  const iconColor = variant === "error" ? "text-red-500" : "text-emerald-500";

  return (
    <div
      role="alert"
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-[var(--text,#eafcff)] ${borderAndBg}`}
    >
      <Icon size={16} className={`shrink-0 ${iconColor}`} />
      <span>{children}</span>
    </div>
  );
}
