import { GoogleGenAI, type Content, type FunctionCall, type FunctionDeclaration } from "@google/genai";

export async function generateText(model: string, prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({ model, contents: prompt });
  return response.text ?? "";
}

export async function generateWithTools(
  model: string,
  contents: Content[],
  config: { systemInstruction?: string; tools?: FunctionDeclaration[] }
): Promise<{ text: string; functionCalls: FunctionCall[]; modelContent: Content }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction: config.systemInstruction,
      tools: config.tools ? [{ functionDeclarations: config.tools }] : undefined,
    },
  });

  return {
    text: response.text ?? "",
    functionCalls: response.functionCalls ?? [],
    modelContent: response.candidates?.[0]?.content ?? { role: "model", parts: [] },
  };
}
