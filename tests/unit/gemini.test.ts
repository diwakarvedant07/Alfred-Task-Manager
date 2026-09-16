import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGenerateContent = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(function GoogleGenAI() {
    return { models: { generateContent: mockGenerateContent } };
  }),
}));

import { generateText, generateWithTools } from "@/lib/gemini";

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

describe("generateWithTools", () => {
  beforeEach(() => {
    mockGenerateContent.mockReset();
    process.env.GEMINI_API_KEY = "test-key";
  });

  it("passes contents, systemInstruction, and tools through to generateContent", async () => {
    mockGenerateContent.mockResolvedValue({
      text: "Hi there",
      functionCalls: undefined,
      candidates: [{ content: { role: "model", parts: [{ text: "Hi there" }] } }],
    });

    const tools = [{ name: "doThing", description: "Does a thing", parametersJsonSchema: { type: "object", properties: {} } }];
    const contents = [{ role: "user" as const, parts: [{ text: "hello" }] }];

    await generateWithTools("gemini-3.8-flash", contents, { systemInstruction: "Be helpful.", tools });

    expect(mockGenerateContent).toHaveBeenCalledWith({
      model: "gemini-3.8-flash",
      contents,
      config: {
        systemInstruction: "Be helpful.",
        tools: [{ functionDeclarations: tools }],
      },
    });
  });

  it("returns text, functionCalls, modelContent, and usage from the response", async () => {
    const modelContent = {
      role: "model",
      parts: [{ functionCall: { name: "createTaskInThread", args: { threadId: "t1", title: "Do X" } } }],
    };
    mockGenerateContent.mockResolvedValue({
      text: undefined,
      functionCalls: [{ name: "createTaskInThread", args: { threadId: "t1", title: "Do X" } }],
      candidates: [{ content: modelContent }],
      usageMetadata: { promptTokenCount: 76, candidatesTokenCount: 28, totalTokenCount: 104 },
    });

    const result = await generateWithTools("gemini-3.8-flash", [], {});

    expect(result.text).toBe("");
    expect(result.functionCalls).toEqual([{ name: "createTaskInThread", args: { threadId: "t1", title: "Do X" } }]);
    expect(result.modelContent).toEqual(modelContent);
    expect(result.usage).toEqual({ promptTokenCount: 76, candidatesTokenCount: 28, totalTokenCount: 104 });
  });

  it("defaults usage counts to 0 when usageMetadata is missing", async () => {
    mockGenerateContent.mockResolvedValue({
      text: "just text",
      functionCalls: undefined,
      candidates: [{ content: { role: "model", parts: [{ text: "just text" }] } }],
    });

    const result = await generateWithTools("gemini-3.8-flash", [], {});

    expect(result.usage).toEqual({ promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 });
  });

  it("returns an empty functionCalls array when the response has none", async () => {
    mockGenerateContent.mockResolvedValue({
      text: "just text",
      functionCalls: undefined,
      candidates: [{ content: { role: "model", parts: [{ text: "just text" }] } }],
    });

    const result = await generateWithTools("gemini-3.8-flash", [], {});

    expect(result.functionCalls).toEqual([]);
  });

  it("throws a clear error when GEMINI_API_KEY is not set", async () => {
    delete process.env.GEMINI_API_KEY;

    await expect(generateWithTools("gemini-3.8-flash", [], {})).rejects.toThrow(
      "GEMINI_API_KEY is not set."
    );
  });
});
