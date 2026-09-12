"use client";

import { useState } from "react";

const PRESET_MODELS = ["gemini-2.5-pro", "gemini-2.5-flash"] as const;
const CUSTOM_OPTION = "custom";

function isPresetModel(value: string): boolean {
  return (PRESET_MODELS as readonly string[]).includes(value);
}

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
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <label>
        AI model
        <select
          aria-label="AI model"
          value={showCustomInput ? CUSTOM_OPTION : value}
          onChange={(e) => {
            if (e.target.value === CUSTOM_OPTION) {
              // Just reveal the input and wait for the user to actually type
              // something — do not report a change upstream yet.
              setCustomSelected(true);
            } else {
              setCustomSelected(false);
              onChange(e.target.value);
            }
          }}
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
            // Only report a genuinely non-empty value upstream — an empty
            // custom model id is not a valid model to switch to.
            if (next.trim() !== "") {
              onChange(next);
            }
          }}
        />
      )}
    </div>
  );
}
