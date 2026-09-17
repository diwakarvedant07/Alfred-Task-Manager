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
