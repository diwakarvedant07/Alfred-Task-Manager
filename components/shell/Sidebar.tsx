"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Trash2 } from "lucide-react";

const NAV_ITEMS = [
  { href: "/canvas", label: "Canvas", icon: LayoutGrid },
  { href: "/recycle-bin", label: "Recycle Bin", icon: Trash2 },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="flex w-56 shrink-0 flex-col gap-1 border-r border-[var(--text,#eafcff)]/10 bg-[var(--panel-bg,rgba(15,25,35,0.85))] p-3"
    >
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname?.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-[var(--accent,#38e0ff)]/15 text-[var(--accent,#38e0ff)]"
                : "text-[var(--text,#eafcff)]/70 hover:bg-[var(--text,#eafcff)]/5 hover:text-[var(--text,#eafcff)]"
            }`}
          >
            <Icon size={18} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
