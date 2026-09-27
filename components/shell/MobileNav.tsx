"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isActivePath } from "./Sidebar";

// The sidebar rail is hidden below `sm`; its links move into the header.
export default function MobileNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main (mobile)" className="flex items-center gap-1 sm:hidden">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActivePath(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${
              active ? "bg-accent/15 text-accent" : "text-fg/60 hover:bg-fg/[0.07] hover:text-fg"
            }`}
          >
            <Icon size={18} />
          </Link>
        );
      })}
    </nav>
  );
}
