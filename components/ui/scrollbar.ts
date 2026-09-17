// Tailwind v4 arbitrary-variant syntax -- no plugin needed. Firefox reads
// the two `scrollbar-*` properties; Chrome/Edge/Safari read the
// `::-webkit-scrollbar*` pseudo-elements. Colors are hardcoded to this
// app's single always-dark theme rather than composed through var()+opacity
// (Tailwind's arbitrary-property syntax can't cleanly chain the two).
export const THEMED_SCROLLBAR =
  "[scrollbar-width:thin] [scrollbar-color:rgba(234,252,255,0.2)_transparent] " +
  "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent " +
  "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[rgba(234,252,255,0.2)] " +
  "[&::-webkit-scrollbar-thumb:hover]:bg-[rgba(234,252,255,0.35)]";
