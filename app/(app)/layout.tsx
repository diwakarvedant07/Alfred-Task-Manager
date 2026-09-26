import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import Navbar from "@/components/shell/Navbar";
import Sidebar from "@/components/shell/Sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const userId = session!.user!.id!;
  // The session cookie's signature can still be valid (next-auth JWT
  // sessions are stateless) after the user row it points at is gone — e.g.
  // a dev DB reset while a browser still holds an old session. Redirect
  // instead of letting findUniqueOrThrow crash the whole route with an
  // unhandled 500.
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) {
    redirect("/login");
    return;
  }

  return (
    <div className="flex h-full min-h-0 flex-1">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Navbar
          name={user.name}
          email={user.email}
          themeMode={user.themeMode}
          accentColor={user.accentColor}
          preferredAiModel={user.preferredAiModel}
        />
        <main className="relative flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
