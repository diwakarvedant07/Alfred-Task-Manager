"use client";

import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { NAV_ITEMS, isActivePath } from "./Sidebar";

// Breadcrumb-style "Arc › Canvas" so the header says where you are.
export default function PageTitle() {
  const pathname = usePathname();
  const current = NAV_ITEMS.find((item) => isActivePath(pathname, item.href));
  if (!current) return null;
  return (
    <>
      <ChevronRight size={14} className="text-fg/30" aria-hidden />
      <span className="truncate text-fg/60">{current.label}</span>
    </>
  );
}
