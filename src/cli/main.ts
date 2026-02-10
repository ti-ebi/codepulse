#!/usr/bin/env node

/**
 * CodePulse CLI entry point.
 *
 * This file is the bin target. It wires together real dependencies
 * (process I/O, filesystem, adapter registry) and delegates to the
 * runner.
 */

import * as node_fs from "node:fs/promises";
import * as node_process from "node:process";
import { AdapterRegistry } from "../adapter/registry.js";
import { createSccAdapter } from "../adapter/scc.js";
import { createJscpdAdapter } from "../adapter/jscpd.js";
import { createKnipAdapter } from "../adapter/knip.js";
import { createMadgeAdapter } from "../adapter/madge.js";
import { createC8Adapter } from "../adapter/c8.js";
import { createEslintAdapter } from "../adapter/eslint.js";
import { createSemgrepAdapter } from "../adapter/semgrep.js";
import { createTypedocAdapter } from "../adapter/typedoc.js";
import { createMcpServer } from "../mcp/server.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { run } from "./run.js";
import type { CliDeps } from "./run.js";

const registry = new AdapterRegistry();
registry.register(createSccAdapter());
registry.register(createJscpdAdapter());
registry.register(createKnipAdapter());
registry.register(createMadgeAdapter());
registry.register(createC8Adapter());
registry.register(createEslintAdapter());
registry.register(createSemgrepAdapter());
registry.register(createTypedocAdapter());

const deps: CliDeps = {
  stdout: (text: string) => node_process.stdout.write(text + "\n"),
  stderr: (text: string) => node_process.stderr.write(text + "\n"),
  registry,
  writeFn: async (path: string, content: string) => {
    await node_fs.writeFile(path, content, "utf-8");
  },
  startMcpServer: async () => {
    const server = createMcpServer({ registry });
    const transport = new StdioServerTransport();
    await server.connect(transport);
  },
};

// Strip the first two entries (node binary, script path).
const argv = node_process.argv.slice(2);

run(argv, deps).then((code) => {
  // eslint-disable-next-line no-process-exit
  node_process.exit(code);
});
