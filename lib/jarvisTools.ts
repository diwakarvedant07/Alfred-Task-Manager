import type { FunctionDeclaration } from "@google/genai";

export type JarvisToolName =
  | "createTaskInThread"
  | "createThreadWithTask"
  | "addTaskUpdate"
  | "updateTaskFields"
  | "findTasks";

export const JARVIS_TOOLS: FunctionDeclaration[] = [
  {
    name: "createTaskInThread",
    description:
      "Create a new task inside an existing thread. Use this when the user's message clearly matches one of the threads listed in the system context.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        threadId: { type: "string", description: "The id of the existing thread to create the task in, from the thread list in context." },
        title: { type: "string", description: "A short task title summarizing what needs to be done." },
        description: { type: "string", description: "Optional longer description of the task." },
        dueDate: { type: "string", description: "Optional due date in YYYY-MM-DD format." },
      },
      required: ["threadId", "title"],
    },
  },
  {
    name: "createThreadWithTask",
    description:
      "Create a brand-new thread and a first task in it. Use this only when the user's message clearly does not belong to any existing thread listed in context.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        threadName: { type: "string", description: "A short name for the new thread." },
        categoryColor: { type: "string", description: "Optional hex color for the thread, e.g. '#38e0ff'. Omit to use a default." },
        title: { type: "string", description: "A short task title for the first task in this new thread." },
        description: { type: "string", description: "Optional longer description of the task." },
        dueDate: { type: "string", description: "Optional due date in YYYY-MM-DD format." },
      },
      required: ["threadName", "title"],
    },
  },
  {
    name: "addTaskUpdate",
    description:
      "Log a progress comment on an existing task, without changing its status or priority. Use this for messages that describe progress on something already tracked. Use the findTasks tool first if you need to look up the task's id by name.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "The id of the existing task to comment on." },
        body: { type: "string", description: "The comment text." },
      },
      required: ["taskId", "body"],
    },
  },
  {
    name: "updateTaskFields",
    description:
      "Change an existing task's status and/or priority. Use this for messages that indicate a task is done, in progress, or has changed urgency. Use the findTasks tool first if you need to look up the task's id by name.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "The id of the existing task to update." },
        status: { type: "string", enum: ["TODO", "IN_PROGRESS", "DONE"], description: "Optional new work status." },
        priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"], description: "Optional new priority." },
      },
      required: ["taskId"],
    },
  },
  {
    name: "findTasks",
    description:
      "Search the user's own tasks by a text query matching the title or description. Use this to resolve a task mentioned by name/description to its id before calling addTaskUpdate or updateTaskFields. Returns up to 5 candidate matches with their ids, titles, and thread names.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text to search for in task titles/descriptions." },
      },
      required: ["query"],
    },
  },
];
