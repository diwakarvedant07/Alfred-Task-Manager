// Shared look for Input / Textarea / Select so every form field has the
// same height, border, focus ring and disabled state.
export const FIELD_CLASSNAME =
  "w-full rounded-xl border border-fg/12 bg-surface text-fg placeholder:text-fg/35 outline-none " +
  "transition-[border-color,box-shadow,background-color] duration-200 " +
  "hover:border-fg/20 focus:border-accent/70 focus:ring-4 focus:ring-accent/15 " +
  "disabled:cursor-not-allowed disabled:opacity-60";

export const LABEL_CLASSNAME = "text-xs font-medium tracking-wide text-fg/70";
