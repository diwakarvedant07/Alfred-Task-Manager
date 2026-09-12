"use client";

import { useState, useEffect } from "react";

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
  const [isCustomMode, setIsCustomMode] = useState(!preset);

  useEffect(() => {
    if (preset) {
      setIsCustomMode(false);
      setCustomText("");
    } else {
      setIsCustomMode(true);
      setCustomText(value);
    }
  }, [value, preset]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <label>
        AI model
        <select
          aria-label="AI model"
          value={isCustomMode ? CUSTOM_OPTION : value}
          onChange={(e) => {
            if (e.target.value === CUSTOM_OPTION) {
              setIsCustomMode(true);
              onChange(customText);
            } else {
              setIsCustomMode(false);
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
      {isCustomMode && (
        <input
          aria-label="Custom model ID"
          value={customText}
          onChange={(e) => {
            setCustomText(e.target.value);
            onChange(e.target.value);
          }}
        />
      )}
    </div>
  );
}
