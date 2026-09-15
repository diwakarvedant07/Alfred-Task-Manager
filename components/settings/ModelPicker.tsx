"use client";

import { useState } from "react";

const PRESET_MODELS = ["gemini-3.8-flash", "gemini-3.1-pro-preview"] as const;
const CUSTOM_OPTION = "custom";

function isPresetModel(value: string): boolean {
  return (PRESET_MODELS as readonly string[]).includes(value);
}

const fieldClassName =
  "rounded-lg border border-[var(--text,#eafcff)]/15 bg-transparent px-2 py-1 text-sm text-[var(--text,#eafcff)] outline-none focus:border-[var(--accent,#38e0ff)]";

export default function ModelPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (model: string) => void;
}) {
  const preset = isPresetModel(value);
  const [customText, setCustomText] = useState(preset ? "" : value);
  // Whether the user has explicitly switched the select to "Custom…" this
  // render session. Kept separate from `preset` (which is derived from the
  // controlled `value` prop) because switching to Custom must reveal the
  // input WITHOUT calling onChange: customText starts out empty at that
  // point, and calling onChange("") used to fire updatePreferredAiModel("")
  // — which throws ("Model id must not be empty.") as an unhandled
  // rejection, since the call isn't awaited/caught by the caller.
  const [customSelected, setCustomSelected] = useState(!preset);

  const showCustomInput = preset ? customSelected : true;

  return (
    <div className="flex flex-col gap-1.5 text-sm text-[var(--text,#eafcff)]">
      <label className="flex items-center justify-between gap-2">
        AI model
        <select
          aria-label="AI model"
          value={showCustomInput ? CUSTOM_OPTION : value}
          onChange={(e) => {
            if (e.target.value === CUSTOM_OPTION) {
              setCustomSelected(true);
            } else {
              setCustomSelected(false);
              onChange(e.target.value);
            }
          }}
          className={fieldClassName}
        >
          {PRESET_MODELS.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
          <option value={CUSTOM_OPTION}>Custom…</option>
        </select>
      </label>
      {showCustomInput && (
        <input
          aria-label="Custom model ID"
          value={customText}
          onChange={(e) => {
            const next = e.target.value;
            setCustomText(next);
            if (next.trim() !== "") {
              onChange(next);
            }
          }}
          className={fieldClassName}
        />
      )}
    </div>
  );
}
