import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import Navbar from "@/components/shell/Navbar";
import Sidebar from "@/components/shell/Sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const userId = session!.user!.id!;
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });

  return (
    <div className="flex h-full flex-1">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Navbar
          name={user.name}
          email={user.email}
          themeMode={user.themeMode}
          accentColor={user.accentColor}
          preferredAiModel={user.preferredAiModel}
        />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
