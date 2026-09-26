// Tailwind v4 arbitrary-variant syntax -- no plugin needed. Firefox reads
// the two `scrollbar-*` properties; Chrome/Edge/Safari read the
// `::-webkit-scrollbar*` pseudo-elements. Colors are mixed from the theme's
// --text variable so the thumb stays visible in both light and dark mode.
export const THEMED_SCROLLBAR =
  "[scrollbar-width:thin] [scrollbar-color:color-mix(in_srgb,var(--text)_20%,transparent)_transparent] " +
  "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent " +
  "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-fg/20 " +
  "[&::-webkit-scrollbar-thumb:hover]:bg-fg/35";
