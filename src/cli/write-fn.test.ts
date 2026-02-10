/**
 * Tests for the production writeFn implementation.
 *
 * The writeFn used in main.ts must create parent directories when they
 * do not exist, so that `--output deep/nested/report.json` works without
 * requiring users to manually create directories.
 */

import { describe, it, expect, afterEach } from "vitest";
import * as node_fs from "node:fs/promises";
import * as node_path from "node:path";
import * as node_os from "node:os";

/**
 * The production writeFn extracted for testability.
 * This mirrors the implementation in main.ts.
 */
async function writeFn(path: string, content: string): Promise<void> {
  const dir = node_path.dirname(path);
  await node_fs.mkdir(dir, { recursive: true });
  await node_fs.writeFile(path, content, "utf-8");
}

describe("writeFn", () => {
  const tmpDirs: string[] = [];

  async function makeTmpDir(): Promise<string> {
    const dir = await node_fs.mkdtemp(node_path.join(node_os.tmpdir(), "codepulse-test-"));
    tmpDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    for (const dir of tmpDirs) {
      await node_fs.rm(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  it("writes a file when the parent directory already exists", async () => {
    const tmp = await makeTmpDir();
    const filePath = node_path.join(tmp, "report.json");

    await writeFn(filePath, '{"ok":true}');

    const content = await node_fs.readFile(filePath, "utf-8");
    expect(content).toBe('{"ok":true}');
  });

  it("creates parent directories when they do not exist", async () => {
    const tmp = await makeTmpDir();
    const filePath = node_path.join(tmp, "deep", "nested", "dir", "report.json");

    await writeFn(filePath, '{"nested":true}');

    const content = await node_fs.readFile(filePath, "utf-8");
    expect(content).toBe('{"nested":true}');
  });

  it("succeeds when parent directory already exists (idempotent)", async () => {
    const tmp = await makeTmpDir();
    const dir = node_path.join(tmp, "existing");
    await node_fs.mkdir(dir);
    const filePath = node_path.join(dir, "report.json");

    await writeFn(filePath, "content");

    const content = await node_fs.readFile(filePath, "utf-8");
    expect(content).toBe("content");
  });
});
