import Orb from "@/components/ui/Orb";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    // Scrolls (rather than clipping) when the screen is short — a phone in
    // landscape, or with the keyboard up. justify-center-safe falls back to
    // top-aligned when the content overflows, so the top isn't cut off.
    <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center-safe gap-8 overflow-x-hidden overflow-y-auto p-6">
      {/* Soft accent glow behind the card. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60 blur-3xl"
        style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--accent) 22%, transparent), transparent 65%)" }}
      />
      <div className="relative flex animate-rise flex-col items-center gap-3 text-center">
        <Orb state="breathing" size={72} />
        <div>
          <p className="text-lg font-semibold tracking-tight text-fg">Arc</p>
          <p className="text-sm text-fg/50">Your tasks, threaded — with Jarvis on call.</p>
        </div>
      </div>
      <div className="relative flex w-full justify-center">{children}</div>
    </div>
  );
}
