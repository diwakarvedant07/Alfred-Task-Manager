export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-[var(--bg,#0a0e14)] p-6">
      {children}
    </div>
  );
}
