import "dotenv/config";
import "@testing-library/jest-dom/vitest";

// jsdom does not implement scrollIntoView at all (it's simply undefined on
// Element.prototype). Components that auto-scroll a message list into view
// call it in a real browser without issue; under jsdom the call throws and
// crashes rendering. Polyfill it as a no-op so such effects don't blow up
// component tests.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

// jsdom has no 2D canvas and logs a "Not implemented" error for every
// getContext() call. ThinkingOrb (components/ui/Orb.tsx) already handles a
// null context by skipping drawing, so return that quietly instead.
if (typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
}

// framer-motion: finish every animation instantly so AnimatePresence exits
// (closing a thread cluster, closing Jarvis) settle within a waitFor.
import { MotionGlobalConfig } from "framer-motion";
MotionGlobalConfig.skipAnimations = true;
