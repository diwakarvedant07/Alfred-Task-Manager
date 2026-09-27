import { describe, it, expect } from "vitest";
import { detectDevice } from "@/lib/device";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPAD_UA =
  "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

function headers(values: Record<string, string>) {
  return new Headers(values);
}

describe("detectDevice", () => {
  it("prefers the viewport cookie written by the browser", () => {
    const device = detectDevice(headers({ "user-agent": IPHONE_UA, "sec-ch-ua-mobile": "?1" }), "desktop");
    expect(device).toMatchObject({ type: "desktop", source: "cookie" });
  });

  it("uses the Sec-CH-UA-Mobile client hint when there's no cookie", () => {
    expect(detectDevice(headers({ "user-agent": MAC_UA, "sec-ch-ua-mobile": "?1" }), undefined)).toMatchObject({
      type: "mobile",
      source: "client-hint",
    });
    expect(detectDevice(headers({ "sec-ch-ua-mobile": "?0" }), undefined).type).toBe("desktop");
  });

  it("falls back to parsing the user agent", () => {
    expect(detectDevice(headers({ "user-agent": IPHONE_UA }), undefined)).toMatchObject({
      type: "mobile",
      os: "iOS",
      source: "user-agent",
    });
    expect(detectDevice(headers({ "user-agent": IPAD_UA }), undefined).type).toBe("tablet");
    expect(detectDevice(headers({ "user-agent": MAC_UA }), undefined).type).toBe("desktop");
  });

  it("treats a request with no device signals as desktop", () => {
    expect(detectDevice(headers({}), undefined)).toMatchObject({ type: "desktop", os: null, browser: null });
  });

  it("ignores an unrecognised cookie value", () => {
    expect(detectDevice(headers({ "user-agent": IPHONE_UA }), "garbage").source).toBe("user-agent");
  });
});
