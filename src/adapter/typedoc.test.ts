/**
 * Tests for the typedoc adapter.
 *
 * typedoc analyzes TypeScript/JavaScript documentation comments and produces
 * a structured representation of documented symbols, mapped to the
 * "documentation" axis.
 *
 * The adapter follows the Three-Line pattern:
 *   1. Invoke typedoc --json <target>
 *   2. Parse the JSON output
 *   3. Map to CodePulse's AxisMeasurement schema
 *
 * The adapter measures documentation coverage by counting how many exported
 * symbols have documentation comments vs. the total number of exported symbols.
 */

import { describe, it, expect } from "vitest";
import {
  parseTypedocOutput,
  createTypedocAdapter,
  type TypedocChild,
  type TypedocOutput,
  type TypedocExecFn,
} from "./typedoc.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChild(overrides?: Partial<TypedocChild>): TypedocChild {
  return {
    id: 1,
    name: "myFunction",
    kind: 64,
    kindString: "Function",
    comment: undefined,
    ...overrides,
  };
}

function makeOutput(overrides?: Partial<TypedocOutput>): TypedocOutput {
  return {
    children: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// parseTypedocOutput — documentation axis
// ---------------------------------------------------------------------------

describe("parseTypedocOutput", () => {
  it("produces an AxisMeasurement with axisId 'documentation'", () => {
    const result = parseTypedocOutput(makeOutput());
    expect(result.axisId).toBe("documentation");
  });

  it("counts total symbols", () => {
    const output = makeOutput({
      children: [
        makeChild({ name: "foo" }),
        makeChild({ name: "bar" }),
        makeChild({ name: "baz" }),
      ],
    });
    const result = parseTypedocOutput(output);
    const metric = result.summary.find((m) => m.descriptor.id === "total-symbols");
    expect(metric?.value).toBe(3);
  });

  it("counts documented symbols (those with a comment)", () => {
    const output = makeOutput({
      children: [
        makeChild({ name: "foo", comment: { summary: [{ kind: "text", text: "A function" }] } }),
        makeChild({ name: "bar", comment: undefined }),
        makeChild({ name: "baz", comment: { summary: [{ kind: "text", text: "Another function" }] } }),
      ],
    });
    const result = parseTypedocOutput(output);
    const metric = result.summary.find((m) => m.descriptor.id === "documented-symbols");
    expect(metric?.value).toBe(2);
  });

  it("counts undocumented symbols (those without a comment)", () => {
    const output = makeOutput({
      children: [
        makeChild({ name: "foo", comment: { summary: [{ kind: "text", text: "A function" }] } }),
        makeChild({ name: "bar", comment: undefined }),
        makeChild({ name: "baz", comment: undefined }),
      ],
    });
    const result = parseTypedocOutput(output);
    const metric = result.summary.find((m) => m.descriptor.id === "undocumented-symbols");
    expect(metric?.value).toBe(2);
  });

  it("computes documentation coverage as a percentage", () => {
    const output = makeOutput({
      children: [
        makeChild({ name: "a", comment: { summary: [{ kind: "text", text: "docs" }] } }),
        makeChild({ name: "b", comment: undefined }),
        makeChild({ name: "c", comment: { summary: [{ kind: "text", text: "docs" }] } }),
        makeChild({ name: "d", comment: { summary: [{ kind: "text", text: "docs" }] } }),
      ],
    });
    const result = parseTypedocOutput(output);
    const metric = result.summary.find((m) => m.descriptor.id === "documentation-coverage");
    expect(metric?.value).toBe(75);
  });

  it("handles zero symbols gracefully (100% coverage)", () => {
    const result = parseTypedocOutput(makeOutput({ children: [] }));
    const totalSymbols = result.summary.find((m) => m.descriptor.id === "total-symbols");
    expect(totalSymbols?.value).toBe(0);
    const coverage = result.summary.find((m) => m.descriptor.id === "documentation-coverage");
    expect(coverage?.value).toBe(100);
  });

  it("handles all documented symbols (100% coverage)", () => {
    const output = makeOutput({
      children: [
        makeChild({ name: "a", comment: { summary: [{ kind: "text", text: "docs" }] } }),
        makeChild({ name: "b", comment: { summary: [{ kind: "text", text: "docs" }] } }),
      ],
    });
    const result = parseTypedocOutput(output);
    const coverage = result.summary.find((m) => m.descriptor.id === "documentation-coverage");
    expect(coverage?.value).toBe(100);
  });

  it("handles all undocumented symbols (0% coverage)", () => {
    const output = makeOutput({
      children: [
        makeChild({ name: "a", comment: undefined }),
        makeChild({ name: "b", comment: undefined }),
      ],
    });
    const result = parseTypedocOutput(output);
    const coverage = result.summary.find((m) => m.descriptor.id === "documentation-coverage");
    expect(coverage?.value).toBe(0);
  });

  it("treats empty comment summary as undocumented", () => {
    const output = makeOutput({
      children: [
        makeChild({ name: "a", comment: { summary: [] } }),
      ],
    });
    const result = parseTypedocOutput(output);
    const documented = result.summary.find((m) => m.descriptor.id === "documented-symbols");
    expect(documented?.value).toBe(0);
  });

  it("produces per-symbol file measurements sorted by name", () => {
    const output = makeOutput({
      children: [
        makeChild({ name: "zFunc", comment: undefined }),
        makeChild({ name: "aFunc", comment: { summary: [{ kind: "text", text: "docs" }] } }),
        makeChild({ name: "mFunc", comment: undefined }),
      ],
    });
    const result = parseTypedocOutput(output);

    expect(result.files).toHaveLength(3);
    expect(result.files[0]?.filePath).toBe("aFunc");
    expect(result.files[1]?.filePath).toBe("mFunc");
    expect(result.files[2]?.filePath).toBe("zFunc");
  });

  it("marks documented symbols with 1 and undocumented with 0 in per-symbol breakdown", () => {
    const output = makeOutput({
      children: [
        makeChild({ name: "documented", comment: { summary: [{ kind: "text", text: "docs" }] } }),
        makeChild({ name: "undocumented", comment: undefined }),
      ],
    });
    const result = parseTypedocOutput(output);

    const documented = result.files.find((f) => f.filePath === "documented");
    const hasDocMetric = documented?.metrics.find((m) => m.descriptor.id === "has-documentation");
    expect(hasDocMetric?.value).toBe(1);

    const undocumented = result.files.find((f) => f.filePath === "undocumented");
    const noDocMetric = undocumented?.metrics.find((m) => m.descriptor.id === "has-documentation");
    expect(noDocMetric?.value).toBe(0);
  });

  it("produces deterministic output for identical input", () => {
    const output = makeOutput({
      children: [
        makeChild({ name: "foo", comment: { summary: [{ kind: "text", text: "docs" }] } }),
        makeChild({ name: "bar", comment: undefined }),
      ],
    });
    const result1 = parseTypedocOutput(output);
    const result2 = parseTypedocOutput(output);
    expect(result1).toEqual(result2);
  });

  it("includes metric metadata with correct units and ranges", () => {
    const result = parseTypedocOutput(makeOutput());

    const totalSymbols = result.summary.find((m) => m.descriptor.id === "total-symbols");
    expect(totalSymbols?.descriptor.unit).toBe("count");
    expect(totalSymbols?.descriptor.min).toBe(0);
    expect(totalSymbols?.descriptor.max).toBeNull();

    const coverage = result.summary.find((m) => m.descriptor.id === "documentation-coverage");
    expect(coverage?.descriptor.unit).toBe("percent");
    expect(coverage?.descriptor.min).toBe(0);
    expect(coverage?.descriptor.max).toBe(100);
  });

  it("includes interpretation guidance in metric descriptors", () => {
    const result = parseTypedocOutput(makeOutput());

    for (const metric of result.summary) {
      expect(metric.descriptor.interpretation).toBeTruthy();
      expect(typeof metric.descriptor.interpretation).toBe("string");
    }
  });

  it("includes symbol kind in per-symbol measurements", () => {
    const output = makeOutput({
      children: [
        makeChild({ name: "myFunc", kindString: "Function", comment: undefined }),
      ],
    });
    const result = parseTypedocOutput(output);
    const file = result.files[0]!;
    const kindMetric = file.metrics.find((m) => m.descriptor.id === "symbol-kind");
    // kind is encoded as a numeric code from typedoc
    expect(kindMetric).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// createTypedocAdapter — adapter factory
// ---------------------------------------------------------------------------

describe("createTypedocAdapter", () => {
  it("reports availability when typedoc is found", async () => {
    const execFn: TypedocExecFn = async (_args) => ({
      ok: true as const,
      stdout: "TypeDoc 0.25.0",
    });
    const adapter = createTypedocAdapter(execFn);
    const availability = await adapter.checkAvailability();
    expect(availability.available).toBe(true);
    if (availability.available) {
      expect(availability.version).toBe("0.25.0");
    }
  });

  it("reports unavailability when typedoc is not found", async () => {
    const execFn: TypedocExecFn = async () => ({
      ok: false as const,
      error: "command not found",
    });
    const adapter = createTypedocAdapter(execFn);
    const availability = await adapter.checkAvailability();
    expect(availability.available).toBe(false);
  });

  it("has id 'typedoc' and supports documentation axis", () => {
    const execFn: TypedocExecFn = async () => ({ ok: true as const, stdout: "" });
    const adapter = createTypedocAdapter(execFn);
    expect(adapter.id).toBe("typedoc");
    expect(adapter.supportedAxes).toContain("documentation");
  });

  it("invokes typedoc with --json flag", async () => {
    const capturedCalls: (readonly string[])[] = [];

    const execFn: TypedocExecFn = async (args) => {
      capturedCalls.push(args);
      return { ok: true as const, stdout: JSON.stringify({ children: [] }) };
    };
    const adapter = createTypedocAdapter(execFn);
    const result = await adapter.measure("/project", "documentation");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.axisId).toBe("documentation");
    }

    expect(capturedCalls).toHaveLength(1);
    expect(capturedCalls[0]).toContain("--json");
  });

  it("passes target path as entrypoint to typedoc", async () => {
    const capturedCalls: (readonly string[])[] = [];

    const execFn: TypedocExecFn = async (args) => {
      capturedCalls.push(args);
      return { ok: true as const, stdout: JSON.stringify({ children: [] }) };
    };
    const adapter = createTypedocAdapter(execFn);
    await adapter.measure("/my/project", "documentation");

    expect(capturedCalls[0]).toContain("/my/project");
  });

  it("returns an error when typedoc execution fails", async () => {
    const execFn: TypedocExecFn = async () => ({
      ok: false as const,
      error: "typedoc crashed",
    });
    const adapter = createTypedocAdapter(execFn);
    const result = await adapter.measure("/project", "documentation");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.adapterId).toBe("typedoc");
      expect(result.error.message).toContain("typedoc");
    }
  });

  it("returns an error when JSON output is invalid", async () => {
    const execFn: TypedocExecFn = async () => ({
      ok: true as const,
      stdout: "not valid json {{{",
    });
    const adapter = createTypedocAdapter(execFn);
    const result = await adapter.measure("/project", "documentation");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.adapterId).toBe("typedoc");
      expect(result.error.message).toContain("parse");
    }
  });

  it("parses version from typedoc --version output", async () => {
    const execFn: TypedocExecFn = async (args) => {
      if (args.includes("--version")) {
        return { ok: true as const, stdout: "TypeDoc 0.26.1\n" };
      }
      return { ok: true as const, stdout: JSON.stringify({ children: [] }) };
    };
    const adapter = createTypedocAdapter(execFn);
    const availability = await adapter.checkAvailability();
    expect(availability.available).toBe(true);
    if (availability.available) {
      expect(availability.version).toBe("0.26.1");
    }
  });

  it("handles output with missing children array gracefully", async () => {
    const execFn: TypedocExecFn = async () => ({
      ok: true as const,
      stdout: JSON.stringify({}),
    });
    const adapter = createTypedocAdapter(execFn);
    const result = await adapter.measure("/project", "documentation");

    expect(result.ok).toBe(true);
    if (result.ok) {
      const totalSymbols = result.value.summary.find((m) => m.descriptor.id === "total-symbols");
      expect(totalSymbols?.value).toBe(0);
    }
  });

  it("uses stdout output for json parsing", async () => {
    const typedocOutput: TypedocOutput = {
      children: [
        makeChild({ name: "func1", comment: { summary: [{ kind: "text", text: "Documented" }] } }),
        makeChild({ name: "func2", comment: undefined }),
      ],
    };

    const execFn: TypedocExecFn = async () => ({
      ok: true as const,
      stdout: JSON.stringify(typedocOutput),
    });
    const adapter = createTypedocAdapter(execFn);
    const result = await adapter.measure("/project", "documentation");

    expect(result.ok).toBe(true);
    if (result.ok) {
      const documented = result.value.summary.find((m) => m.descriptor.id === "documented-symbols");
      expect(documented?.value).toBe(1);
      const undocumented = result.value.summary.find((m) => m.descriptor.id === "undocumented-symbols");
      expect(undocumented?.value).toBe(1);
    }
  });
});
