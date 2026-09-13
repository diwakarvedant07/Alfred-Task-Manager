import { AlertCircle, CheckCircle2 } from "lucide-react";

export default function FormAlert({
  variant = "error",
  children,
}: {
  variant?: "error" | "success";
  children: React.ReactNode;
}) {
  const Icon = variant === "error" ? AlertCircle : CheckCircle2;
  const colorClass =
    variant === "error"
      ? "border-red-500/30 bg-red-500/10 text-red-200"
      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";

  return (
    <div role="alert" className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${colorClass}`}>
      <Icon size={16} className="shrink-0" />
      <span>{children}</span>
    </div>
  );
}
