"use client";

import { useId, type Ref, type TextareaHTMLAttributes } from "react";
import { FIELD_CLASSNAME, LABEL_CLASSNAME } from "./fieldStyles";

export default function Textarea({
  label,
  hideLabel = false,
  className = "",
  id,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  // React 19 passes `ref` through as an ordinary prop; it reaches the
  // <textarea> via the `...rest` spread below.
  ref?: Ref<HTMLTextAreaElement>;
  label: string;
  hideLabel?: boolean;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <label
        htmlFor={inputId}
        className={hideLabel ? "sr-only" : LABEL_CLASSNAME}
      >
        {label}
      </label>
      <textarea
        id={inputId}
        className={`${FIELD_CLASSNAME} px-3 py-2.5 leading-relaxed ${className}`}
        {...rest}
      />
    </div>
  );
}
