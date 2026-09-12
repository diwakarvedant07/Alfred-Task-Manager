import { describe, it, expect } from "vitest";
import { JARVIS_TOOLS } from "@/lib/jarvisTools";

describe("JARVIS_TOOLS", () => {
  it("declares exactly the five expected tools by name", () => {
    const names = JARVIS_TOOLS.map((t) => t.name).sort();
    expect(names).toEqual(
      ["addTaskUpdate", "createTaskInThread", "createThreadWithTask", "findTasks", "updateTaskFields"].sort()
    );
  });

  it("every tool has a non-empty description", () => {
    for (const tool of JARVIS_TOOLS) {
      expect(tool.description).toBeTruthy();
    }
  });

  it("createTaskInThread requires threadId and title", () => {
    const tool = JARVIS_TOOLS.find((t) => t.name === "createTaskInThread")!;
    const schema = tool.parametersJsonSchema as { required: string[]; properties: Record<string, unknown> };
    expect(schema.required).toEqual(expect.arrayContaining(["threadId", "title"]));
    expect(schema.properties).toHaveProperty("threadId");
    expect(schema.properties).toHaveProperty("title");
    expect(schema.properties).toHaveProperty("description");
    expect(schema.properties).toHaveProperty("dueDate");
  });

  it("createThreadWithTask requires threadName and title, categoryColor is optional", () => {
    const tool = JARVIS_TOOLS.find((t) => t.name === "createThreadWithTask")!;
    const schema = tool.parametersJsonSchema as { required: string[]; properties: Record<string, unknown> };
    expect(schema.required).toEqual(expect.arrayContaining(["threadName", "title"]));
    expect(schema.required).not.toContain("categoryColor");
    expect(schema.properties).toHaveProperty("categoryColor");
  });

  it("addTaskUpdate requires taskId and body", () => {
    const tool = JARVIS_TOOLS.find((t) => t.name === "addTaskUpdate")!;
    const schema = tool.parametersJsonSchema as { required: string[] };
    expect(schema.required).toEqual(expect.arrayContaining(["taskId", "body"]));
  });

  it("updateTaskFields requires only taskId, status and priority are optional", () => {
    const tool = JARVIS_TOOLS.find((t) => t.name === "updateTaskFields")!;
    const schema = tool.parametersJsonSchema as { required: string[]; properties: Record<string, unknown> };
    expect(schema.required).toEqual(["taskId"]);
    expect(schema.properties).toHaveProperty("status");
    expect(schema.properties).toHaveProperty("priority");
  });

  it("findTasks requires query", () => {
    const tool = JARVIS_TOOLS.find((t) => t.name === "findTasks")!;
    const schema = tool.parametersJsonSchema as { required: string[] };
    expect(schema.required).toEqual(["query"]);
  });
});
