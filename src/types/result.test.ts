import { describe, it, expect } from "vitest";
import { ok, err } from "./result.js";
import type { Result } from "./result.js";

describe("Result type", () => {
  it("ok() creates a successful result", () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(42);
    }
  });

  it("err() creates a failure result", () => {
    const error = new Error("something went wrong");
    const result = err(error);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(error);
    }
  });

  it("ok() works with complex types", () => {
    const data = { metrics: [1, 2, 3], label: "test" };
    const result = ok(data);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(data);
    }
  });

  it("err() works with string errors", () => {
    const result: Result<number, string> = err("not found");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("not found");
    }
  });

  it("narrows types correctly via ok discriminant", () => {
    const success: Result<string, Error> = ok("hello");
    const failure: Result<string, Error> = err(new Error("fail"));

    // Type narrowing should work in conditionals
    if (success.ok) {
      const _val: string = success.value;
      expect(_val).toBe("hello");
    }

    if (!failure.ok) {
      const _e: Error = failure.error;
      expect(_e.message).toBe("fail");
    }
  });
});
