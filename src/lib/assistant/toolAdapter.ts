/**
 * Convert the existing OpenAI-style read tools (src/lib/chat-assistant/chat-tools.ts)
 * into Gemini function declarations.
 */

export interface OpenAIStyleTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parametersJsonSchema: Record<string, unknown>;
}

const EMPTY_SCHEMA = { type: "object", properties: {} };

export function toGeminiDeclarations(tools: readonly OpenAIStyleTool[]): GeminiFunctionDeclaration[] {
  return tools
    .filter((t) => t?.type === "function" && t.function?.name)
    .map((t) => ({
      name: t.function.name,
      description: t.function.description ?? "",
      parametersJsonSchema: (t.function.parameters as Record<string, unknown>) ?? EMPTY_SCHEMA,
    }));
}
