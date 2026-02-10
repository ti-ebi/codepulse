/**
 * madge adapter.
 *
 * Integrates the madge external tool (https://github.com/pahen/madge) with
 * CodePulse. madge analyzes module dependency graphs and detects circular
 * dependencies in JavaScript/TypeScript projects.
 *
 * This adapter supports one measurement axis:
 *   - "dependency-health" — circular dependencies, graph depth, module count
 *
 * The adapter follows the Three-Line pattern:
 *   1. Invoke madge with --json and --circular --json
 *   2. Parse the JSON outputs
 *   3. Map to CodePulse's AxisMeasurement schema
 */

import type { AxisId } from "../types/axis.js";
import type {
  AxisMeasurement,
  FileMeasurement,
  MetricDescriptor,
  MetricValue,
} from "../types/measurement.js";
import type { Result } from "../types/result.js";
import { ok, err } from "../types/result.js";
import type { AdapterError, ToolAdapter, ToolAvailability } from "./adapter.js";

// ---------------------------------------------------------------------------
// madge output types
// ---------------------------------------------------------------------------

/**
 * madge --json output: an object mapping each module to its dependencies.
 * Example: { "src/a.ts": ["src/b.ts", "src/c.ts"], "src/b.ts": [] }
 */
export type MadgeDependencyGraph = Readonly<Record<string, readonly string[]>>;

/**
 * madge --circular --json output: an array of circular dependency chains.
 * Example: [["src/a.ts", "src/b.ts"], ["src/c.ts", "src/d.ts", "src/e.ts"]]
 */
export type MadgeCircularDeps = readonly (readonly string[])[];

// ---------------------------------------------------------------------------
// Exec function type — injectable for testing
// ---------------------------------------------------------------------------

export type MadgeExecResult =
  | { readonly ok: true; readonly stdout: string }
  | { readonly ok: false; readonly error: string };

export type MadgeExecFn = (args: readonly string[]) => Promise<MadgeExecResult>;

// ---------------------------------------------------------------------------
// Metric descriptors
// ---------------------------------------------------------------------------

const SUMMARY_DESCRIPTORS = {
  totalModules: {
    id: "total-modules",
    name: "Total Modules",
    unit: "modules",
    min: 0,
    max: null,
    interpretation: "Total number of modules in the dependency graph",
  },
  totalEdges: {
    id: "total-edges",
    name: "Total Edges",
    unit: "count",
    min: 0,
    max: null,
    interpretation: "Total number of dependency relationships between modules",
  },
  circularDependencyCount: {
    id: "circular-dependency-count",
    name: "Circular Dependency Chains",
    unit: "count",
    min: 0,
    max: null,
    interpretation: "Number of distinct circular dependency chains detected",
  },
  modulesInCycles: {
    id: "modules-in-cycles",
    name: "Modules in Cycles",
    unit: "modules",
    min: 0,
    max: null,
    interpretation: "Number of unique modules involved in at least one circular dependency",
  },
  maxGraphDepth: {
    id: "max-graph-depth",
    name: "Max Graph Depth",
    unit: "levels",
    min: 0,
    max: null,
    interpretation: "Longest chain of dependencies from any module to a leaf module",
  },
  averageDepsPerModule: {
    id: "average-deps-per-module",
    name: "Average Dependencies per Module",
    unit: "count",
    min: 0,
    max: null,
    interpretation: "Mean number of direct dependencies per module",
  },
} as const satisfies Record<string, MetricDescriptor>;

const FILE_DESCRIPTORS = {
  fileDependencyCount: {
    id: "file-dependency-count",
    name: "Dependency Count",
    unit: "count",
    min: 0,
    max: null,
    interpretation: "Number of direct dependencies for this module",
  },
  fileInCycle: {
    id: "file-in-cycle",
    name: "In Cycle",
    unit: "boolean",
    min: 0,
    max: 1,
    interpretation: "Whether this module is involved in a circular dependency (1 = yes, 0 = no)",
  },
} as const satisfies Record<string, MetricDescriptor>;

// ---------------------------------------------------------------------------
// Parsing — transforms madge output into AxisMeasurement
// ---------------------------------------------------------------------------

function collectModulesInCycles(circular: MadgeCircularDeps): ReadonlySet<string> {
  const modules = new Set<string>();
  for (const chain of circular) {
    for (const mod of chain) {
      modules.add(mod);
    }
  }
  return modules;
}

function computeMaxDepth(graph: MadgeDependencyGraph): number {
  function depth(mod: string, visited: ReadonlySet<string>): number {
    const deps = graph[mod];
    if (deps === undefined || deps.length === 0) {
      return 0;
    }

    let maxChildDepth = -1;
    for (const dep of deps) {
      // Skip visited nodes to avoid infinite loops on cycles
      if (visited.has(dep)) {
        continue;
      }
      const newVisited = new Set(visited);
      newVisited.add(dep);
      const childDepth = depth(dep, newVisited);
      if (childDepth > maxChildDepth) {
        maxChildDepth = childDepth;
      }
    }

    // If no reachable children (all skipped due to cycles), treat as leaf
    if (maxChildDepth < 0) {
      return 0;
    }

    return 1 + maxChildDepth;
  }

  let max = 0;
  for (const mod of Object.keys(graph)) {
    const d = depth(mod, new Set([mod]));
    if (d > max) {
      max = d;
    }
  }
  return max;
}

function countTotalEdges(graph: MadgeDependencyGraph): number {
  let total = 0;
  for (const deps of Object.values(graph)) {
    total += deps.length;
  }
  return total;
}

function buildSummary(
  graph: MadgeDependencyGraph,
  circular: MadgeCircularDeps,
): readonly MetricValue[] {
  const moduleCount = Object.keys(graph).length;
  const totalEdges = countTotalEdges(graph);
  const modulesInCycles = collectModulesInCycles(circular);
  const maxDepth = computeMaxDepth(graph);
  const avgDeps = moduleCount > 0 ? totalEdges / moduleCount : 0;

  return [
    { descriptor: SUMMARY_DESCRIPTORS.totalModules, value: moduleCount },
    { descriptor: SUMMARY_DESCRIPTORS.totalEdges, value: totalEdges },
    { descriptor: SUMMARY_DESCRIPTORS.circularDependencyCount, value: circular.length },
    { descriptor: SUMMARY_DESCRIPTORS.modulesInCycles, value: modulesInCycles.size },
    { descriptor: SUMMARY_DESCRIPTORS.maxGraphDepth, value: maxDepth },
    { descriptor: SUMMARY_DESCRIPTORS.averageDepsPerModule, value: avgDeps },
  ];
}

function buildFiles(
  graph: MadgeDependencyGraph,
  circular: MadgeCircularDeps,
): readonly FileMeasurement[] {
  const modulesInCycles = collectModulesInCycles(circular);

  const sortedModules = Object.keys(graph).sort();

  return sortedModules.map((mod) => ({
    filePath: mod,
    metrics: [
      {
        descriptor: FILE_DESCRIPTORS.fileDependencyCount,
        value: graph[mod]?.length ?? 0,
      },
      {
        descriptor: FILE_DESCRIPTORS.fileInCycle,
        value: modulesInCycles.has(mod) ? 1 : 0,
      },
    ],
  }));
}

/**
 * Parse madge dependency graph and circular dependency output into
 * a CodePulse AxisMeasurement.
 */
export function parseMadgeOutput(
  graph: MadgeDependencyGraph,
  circular: MadgeCircularDeps,
): AxisMeasurement {
  return {
    axisId: "dependency-health",
    summary: buildSummary(graph, circular),
    files: buildFiles(graph, circular),
  };
}

// ---------------------------------------------------------------------------
// Default exec function — invokes madge via npx
// ---------------------------------------------------------------------------

async function defaultExecFn(args: readonly string[]): Promise<MadgeExecResult> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

  try {
    const { stdout } = await execFileAsync("npx", ["madge", ...args]);
    return { ok: true, stdout };
  } catch (cause: unknown) {
    const message =
      cause instanceof Error ? cause.message : String(cause);
    return { ok: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Adapter factory
// ---------------------------------------------------------------------------

function parseVersion(stdout: string): string {
  const trimmed = stdout.trim();
  const match = /(\d+\.\d+\.\d+)/.exec(trimmed);
  return match?.[1] ?? (trimmed || "unknown");
}

/**
 * Create a madge adapter instance.
 *
 * @param execFn - Optional injectable exec function for testing.
 */
export function createMadgeAdapter(execFn?: MadgeExecFn): ToolAdapter {
  const exec = execFn ?? defaultExecFn;

  return {
    id: "madge",
    toolName: "madge",
    supportedAxes: ["dependency-health"] as const,

    async checkAvailability(): Promise<ToolAvailability> {
      const result = await exec(["--version"]);
      if (!result.ok) {
        return { available: false, reason: `madge is not available: ${result.error}` };
      }
      return { available: true, version: parseVersion(result.stdout) };
    },

    async measure(
      targetPath: string,
      _axisId: AxisId,
    ): Promise<Result<AxisMeasurement, AdapterError>> {
      // Step 1: Get the full dependency graph
      const graphResult = await exec(["--json", targetPath]);

      if (!graphResult.ok) {
        return err({
          adapterId: "madge",
          message: `madge execution failed: ${graphResult.error}`,
        });
      }

      let graph: MadgeDependencyGraph;
      try {
        graph = JSON.parse(graphResult.stdout) as MadgeDependencyGraph;
      } catch (cause: unknown) {
        return err({
          adapterId: "madge",
          message: `Failed to parse madge JSON output`,
          cause,
        });
      }

      // Step 2: Get circular dependencies (fail gracefully)
      let circular: MadgeCircularDeps = [];
      const circularResult = await exec(["--circular", "--json", targetPath]);
      if (circularResult.ok) {
        try {
          circular = JSON.parse(circularResult.stdout) as MadgeCircularDeps;
        } catch {
          // Treat unparseable circular output as no circular deps
        }
      }

      // Step 3: Map to CodePulse schema
      return ok(parseMadgeOutput(graph, circular));
    },
  };
}
