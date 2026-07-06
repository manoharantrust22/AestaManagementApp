import { describe, expect, it } from "vitest";

import type { SpaceType } from "@/types/spaces.types";
import { suggestSpaceName } from "./naming";

const of = (...types: SpaceType[]) => types.map((t) => ({ space_type: t }));

describe("suggestSpaceName", () => {
  it("uses the bare label for the first of a type", () => {
    expect(suggestSpaceName("bedroom", [])).toBe("Bedroom");
    expect(suggestSpaceName("kitchen", of("bedroom", "bathroom"))).toBe(
      "Kitchen"
    );
  });

  it("numbers subsequent spaces of the same type", () => {
    expect(suggestSpaceName("bedroom", of("bedroom"))).toBe("Bedroom 2");
    expect(
      suggestSpaceName("bathroom", of("bathroom", "bathroom", "bathroom", "bedroom"))
    ).toBe("Bathroom 4");
  });
});
