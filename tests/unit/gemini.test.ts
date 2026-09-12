import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGenerateContent = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(function GoogleGenAI() {
    return { models: { generateContent: mockGenerateContent } };
  }),
}));

import { generateText } from "@/lib/gemini";

describe("generateText", () => {
  beforeEach(() => {
    mockGenerateContent.mockReset();
    process.env.GEMINI_API_KEY = "test-key";
  });

  it("calls generateContent with the given model and prompt, and returns the response text", async () => {
    mockGenerateContent.mockResolvedValue({ text: "Hello from Gemini" });

    const result = await generateText("gemini-2.5-flash", "Say hi");

    expect(mockGenerateContent).toHaveBeenCalledWith({
      model: "gemini-2.5-flash",
      contents: "Say hi",
    });
    expect(result).toBe("Hello from Gemini");
  });

  it("returns an empty string if the response has no text", async () => {
    mockGenerateContent.mockResolvedValue({ text: undefined });

    const result = await generateText("gemini-2.5-flash", "Say hi");

    expect(result).toBe("");
  });

  it("throws a clear error when GEMINI_API_KEY is not set", async () => {
    delete process.env.GEMINI_API_KEY;

    await expect(generateText("gemini-2.5-flash", "Say hi")).rejects.toThrow(
      "GEMINI_API_KEY is not set."
    );
  });
});
