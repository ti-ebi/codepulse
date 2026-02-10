/**
 * Tests for the centralized version module.
 *
 * The version module exports a single VERSION constant that is the
 * single source of truth for the CodePulse version string. It reads
 * the version from package.json so there is no manual duplication.
 *
 * These tests verify:
 *   - VERSION is a valid semver-like string
 *   - VERSION matches the version in package.json
 */

import { describe, it, expect } from "vitest";
import { VERSION } from "./version.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

describe("VERSION", () => {
  it("is a non-empty string", () => {
    expect(typeof VERSION).toBe("string");
    expect(VERSION.length).toBeGreaterThan(0);
  });

  it("matches the version in package.json", () => {
    const pkg = require("../package.json") as { version: string };
    expect(VERSION).toBe(pkg.version);
  });

  it("has a semver-like format", () => {
    // At minimum: digits.digits.digits, optionally with pre-release suffix
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
