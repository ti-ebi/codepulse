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
import { run } from "./run.js";
import type { CliDeps } from "./run.js";

const registry = new AdapterRegistry();
registry.register(createSccAdapter());
registry.register(createJscpdAdapter());

const deps: CliDeps = {
  stdout: (text: string) => node_process.stdout.write(text + "\n"),
  stderr: (text: string) => node_process.stderr.write(text + "\n"),
  registry,
  writeFn: async (path: string, content: string) => {
    await node_fs.writeFile(path, content, "utf-8");
  },
};

// Strip the first two entries (node binary, script path).
const argv = node_process.argv.slice(2);

run(argv, deps).then((code) => {
  // eslint-disable-next-line no-process-exit
  node_process.exit(code);
});
