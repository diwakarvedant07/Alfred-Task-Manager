"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import Dropdown from "@/components/ui/Dropdown";
import AccentColorPicker from "@/components/settings/AccentColorPicker";
import ThemeToggle from "@/components/settings/ThemeToggle";
import ModelPicker from "@/components/settings/ModelPicker";
import { themeToCssVariables } from "@/lib/theme";
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
      const vars = themeToCssVariables(mode, color);
      for (const [key, value] of Object.entries(vars)) {
        document.documentElement.style.setProperty(key, value);
      }
      await updateThemePreference(mode, color);
      router.refresh();
    },
    [router]
  );

  return (
    <Dropdown
      trigger={({ toggle }) => (
        <button
          aria-label="User menu"
          onClick={toggle}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent,#38e0ff)]/20 text-sm font-semibold text-[var(--accent,#38e0ff)]"
        >
          {initialsOf(name)}
        </button>
      )}
    >
      <div className="mb-2 border-b border-[var(--text,#eafcff)]/10 px-2 pb-2">
        <p className="text-sm font-medium text-[var(--text,#eafcff)]">{name}</p>
        <p className="text-xs text-[var(--text,#eafcff)]/60">{email}</p>
      </div>
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
        className="mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-[var(--text,#eafcff)] hover:bg-red-500/10"
      >
        <LogOut size={16} className="text-red-500" />
        Log out
      </button>
    </Dropdown>
  );
}
