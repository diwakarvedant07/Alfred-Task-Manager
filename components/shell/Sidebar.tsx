"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Trash2 } from "lucide-react";
import Orb from "@/components/ui/Orb";

export const NAV_ITEMS = [
  { href: "/canvas", label: "Canvas", icon: LayoutGrid },
  { href: "/recycle-bin", label: "Recycle Bin", icon: Trash2 },
];

export function isActivePath(pathname: string | null, href: string): boolean {
  return pathname === href || !!pathname?.startsWith(`${href}/`);
}

// A slim icon rail: with only a couple of destinations, the old 224px-wide
// labelled column mostly held empty space the canvas could use. Labels are
// still in the accessible name and appear as a tooltip on hover/focus.
export default function Sidebar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="glass z-20 hidden w-[68px] shrink-0 flex-col items-center gap-2 border-y-0 border-l-0 py-3 sm:flex"
    >
      <Link
        href="/canvas"
        aria-label="Arc home"
        className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl transition-transform duration-300 hover:scale-105"
      >
        <Orb state="breathing" size={36} />
      </Link>
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActivePath(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`group relative flex h-11 w-11 items-center justify-center rounded-xl outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-accent/60 ${
              active ? "bg-accent/15 text-accent" : "text-fg/55 hover:bg-fg/[0.07] hover:text-fg"
            }`}
          >
            {active && (
              <span aria-hidden className="absolute -left-3 h-5 w-1 rounded-r-full bg-accent" />
            )}
            <Icon size={19} strokeWidth={active ? 2.2 : 1.8} />
            <span className="sr-only">{label}</span>
            <span
              aria-hidden
              className="pointer-events-none absolute left-full z-50 ml-3 translate-x-[-4px] whitespace-nowrap rounded-lg bg-fg px-2.5 py-1 text-xs font-medium text-canvas opacity-0 shadow-lg transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
