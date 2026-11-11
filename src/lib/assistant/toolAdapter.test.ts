import { describe, expect, it } from "vitest";
import { toGeminiDeclarations } from "./toolAdapter";
import { TOOL_DEFINITIONS } from "@/lib/chat-assistant/chat-tools";

describe("toGeminiDeclarations", () => {
  it("maps name, description and JSON-schema parameters", () => {
    const out = toGeminiDeclarations([
      {
        type: "function",
        function: {
          name: "get_x",
          description: "Gets x",
          parameters: { type: "object", properties: { a: { type: "string" } }, required: ["a"] },
        },
      },
    ]);
    expect(out).toEqual([
      {
        name: "get_x",
        description: "Gets x",
        parametersJsonSchema: { type: "object", properties: { a: { type: "string" } }, required: ["a"] },
      },
    ]);
  });

  it("fills an empty object schema when parameters are missing", () => {
    const [d] = toGeminiDeclarations([{ type: "function", function: { name: "ping" } }]);
    expect(d.parametersJsonSchema).toEqual({ type: "object", properties: {} });
    expect(d.description).toBe("");
  });

  it("converts every existing read tool with unique names", () => {
    const out = toGeminiDeclarations(TOOL_DEFINITIONS as any);
    expect(out.length).toBe(TOOL_DEFINITIONS.length);
    expect(new Set(out.map((d) => d.name)).size).toBe(out.length);
    out.forEach((d) => expect((d.parametersJsonSchema as any).type).toBe("object"));
  });
});
