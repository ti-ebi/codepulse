/**
 * Tests for CLI argument parsing.
 *
 * The argument parser translates process.argv-style string arrays
 * into a validated MeasurementConfig or returns a structured error.
 */

import { describe, it, expect } from "vitest";
import { parseArgs, type ParseResult } from "./parse-args.js";

describe("parseArgs", () => {
  describe("target path", () => {
    it("extracts a positional target path", () => {
      const result = parseArgs(["/path/to/project"]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.targetPath).toBe("/path/to/project");
    });

    it("returns an error when no target path is provided", () => {
      const result = parseArgs([]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain("target path");
    });
  });

  describe("--format flag", () => {
    it("defaults to terminal-compact when no format is specified", () => {
      const result = parseArgs(["/project"]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.outputFormat).toBe("terminal-compact");
    });

    it("accepts --format json", () => {
      const result = parseArgs(["--format", "json", "/project"]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.outputFormat).toBe("json");
    });

    it("accepts --format terminal-rich", () => {
      const result = parseArgs(["--format", "terminal-rich", "/project"]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.outputFormat).toBe("terminal-rich");
    });

    it("accepts --format terminal-compact", () => {
      const result = parseArgs(["--format", "terminal-compact", "/project"]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.outputFormat).toBe("terminal-compact");
    });

    it("accepts --format html", () => {
      const result = parseArgs(["--format", "html", "/project"]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.outputFormat).toBe("html");
    });

    it("returns an error for unknown format", () => {
      const result = parseArgs(["--format", "xml", "/project"]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain("xml");
    });
  });

  describe("--axis flag", () => {
    it("defaults to empty array (measure all) when no axes specified", () => {
      const result = parseArgs(["/project"]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.axes).toEqual([]);
    });

    it("accepts a single --axis flag", () => {
      const result = parseArgs(["--axis", "complexity", "/project"]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.axes).toEqual(["complexity"]);
    });

    it("accepts multiple --axis flags", () => {
      const result = parseArgs([
        "--axis", "complexity",
        "--axis", "size",
        "/project",
      ]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.axes).toEqual(["complexity", "size"]);
    });

    it("returns an error for unknown axis", () => {
      const result = parseArgs(["--axis", "magic", "/project"]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain("magic");
    });
  });

  describe("--output flag", () => {
    it("defaults to undefined when no output path is specified", () => {
      const result = parseArgs(["/project"]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.outputPath).toBeUndefined();
    });

    it("accepts --output with a file path", () => {
      const result = parseArgs(["--output", "/tmp/report.json", "/project"]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.outputPath).toBe("/tmp/report.json");
    });
  });

  describe("--help flag", () => {
    it("returns a help result when --help is passed", () => {
      const result = parseArgs(["--help"]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("help");
    });

    it("returns help even with other arguments", () => {
      const result = parseArgs(["--format", "json", "--help", "/project"]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("help");
    });
  });

  describe("--version flag", () => {
    it("returns a version result when --version is passed", () => {
      const result = parseArgs(["--version"]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("version");
    });
  });

  describe("thresholds", () => {
    it("defaults to empty thresholds array", () => {
      const result = parseArgs(["/project"]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.thresholds).toEqual([]);
    });
  });

  describe("flag ordering", () => {
    it("handles flags before and after the target path", () => {
      const result = parseArgs([
        "--format", "json",
        "/project",
        "--axis", "size",
      ]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.targetPath).toBe("/project");
      expect(result.value.outputFormat).toBe("json");
      expect(result.value.axes).toEqual(["size"]);
    });
  });

  describe("--mcp flag", () => {
    it("returns an mcp result when --mcp is passed", () => {
      const result = parseArgs(["--mcp"]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("mcp");
    });

    it("returns mcp even with other arguments", () => {
      const result = parseArgs(["--mcp", "/project"]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("mcp");
    });
  });

  describe("unknown flags", () => {
    it("returns an error for unrecognized flags", () => {
      const result = parseArgs(["--unknown", "/project"]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain("--unknown");
    });
  });
});
