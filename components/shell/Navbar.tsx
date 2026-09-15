import UserMenu from "./UserMenu";

export default function Navbar({
  name,
  email,
  themeMode,
  accentColor,
  preferredAiModel,
}: {
  name: string;
  email: string;
  themeMode: "LIGHT" | "DARK";
  accentColor: string;
  preferredAiModel: string;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--text,#eafcff)]/10 bg-[var(--panel-bg,rgba(15,25,35,0.85))] px-4">
      <span className="text-sm font-semibold tracking-wide text-[var(--text,#eafcff)]">Arc</span>
      <UserMenu name={name} email={email} themeMode={themeMode} accentColor={accentColor} preferredAiModel={preferredAiModel} />
    </header>
  );
}
