"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import Dropdown from "@/components/ui/Dropdown";
import AccentColorPicker from "@/components/settings/AccentColorPicker";
import ThemeToggle from "@/components/settings/ThemeToggle";
import ModelPicker from "@/components/settings/ModelPicker";
import { applyThemeToDocument } from "@/lib/applyTheme";
import { updateThemePreference } from "@/app/actions/theme";
import { updatePreferredAiModel } from "@/app/actions/aiModel";

function initialsOf(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

export default function UserMenu({
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
  const router = useRouter();
  const [localThemeMode, setLocalThemeMode] = useState(themeMode);
  const [localAccentColor, setLocalAccentColor] = useState(accentColor);
  const [aiModel, setAiModel] = useState(preferredAiModel);

  // Moved here from components/canvas/Canvas.tsx, which used to own this
  // settings strip directly. Applies the CSS variables immediately (so the
  // change is visible without waiting on the Server Action + router.refresh()
  // round-trip that reconciles the root layout's own ThemeProvider props),
  // then persists the preference and refreshes for later navigations.
  const handleThemeChange = useCallback(
    async (mode: "LIGHT" | "DARK", color: string) => {
      setLocalThemeMode(mode);
      setLocalAccentColor(color);
      applyThemeToDocument(mode, color);
      await updateThemePreference(mode, color);
      router.refresh();
    },
    [router]
  );

  return (
    <Dropdown
      trigger={({ open, toggle }) => (
        <button
          aria-label="User menu"
          aria-expanded={open}
          onClick={toggle}
          className={`flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-accent/35 to-accent/10 text-xs font-semibold text-accent ring-1 transition-all duration-200 hover:ring-accent/60 ${
            open ? "ring-accent/60" : "ring-fg/10"
          }`}
        >
          {initialsOf(name)}
        </button>
      )}
    >
      <div className="mb-2 flex items-center gap-3 border-b border-fg/10 px-2 pb-3 pt-1">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
          {initialsOf(name)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-fg">{name}</p>
          <p className="truncate text-xs text-fg/55">{email}</p>
        </div>
      </div>
      <p className="px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wider text-fg/40">Appearance</p>
      <div className="flex flex-col gap-3 px-2 py-1">
        <AccentColorPicker value={localAccentColor} onChange={(hex) => handleThemeChange(localThemeMode, hex)} />
        <ThemeToggle value={localThemeMode} onChange={(mode) => handleThemeChange(mode, localAccentColor)} />
        <ModelPicker
          value={aiModel}
          onChange={async (model) => {
            setAiModel(model);
            await updatePreferredAiModel(model);
          }}
        />
      </div>
      <button
        onClick={() => signOut({ redirectTo: "/login" })}
        className="mt-2 flex w-full items-center gap-2 rounded-xl border-t border-fg/10 px-2 py-2.5 text-left text-sm text-fg transition-colors hover:bg-red-500/10"
      >
        <LogOut size={16} className="text-red-500" />
        Log out
      </button>
    </Dropdown>
  );
}
