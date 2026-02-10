import { describe, it, expect } from "vitest";
import { AXES } from "./axis.js";
import type { AxisId } from "./axis.js";

describe("AXES registry", () => {
  it("contains all defined axis IDs", () => {
    const expectedIds: AxisId[] = [
      "complexity",
      "duplication",
      "dead-code",
      "size",
      "dependency-health",
      "security",
      "consistency",
      "test-coverage",
      "documentation",
    ];

    for (const id of expectedIds) {
      expect(AXES.has(id)).toBe(true);
    }
    expect(AXES.size).toBe(expectedIds.length);
  });

  it("each descriptor has matching id, non-empty name and description", () => {
    for (const [id, descriptor] of AXES) {
      expect(descriptor.id).toBe(id);
      expect(descriptor.name.length).toBeGreaterThan(0);
      expect(descriptor.description.length).toBeGreaterThan(0);
    }
  });
});
