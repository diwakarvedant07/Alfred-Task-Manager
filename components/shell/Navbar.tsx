import UserMenu from "./UserMenu";
import PageTitle from "./PageTitle";
import MobileNav from "./MobileNav";

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
    <header className="glass relative z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-x-0 border-t-0 px-4">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <span className="font-semibold tracking-tight text-fg">Arc</span>
        <PageTitle />
      </div>
      <div className="flex items-center gap-2">
        <MobileNav />
        <UserMenu name={name} email={email} themeMode={themeMode} accentColor={accentColor} preferredAiModel={preferredAiModel} />
      </div>
    </header>
  );
}
