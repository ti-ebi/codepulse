/**
 * Measurement axes that CodePulse supports.
 * Each axis is independent and delegates to one or more external tools.
 */

export type AxisId =
  | "complexity"
  | "duplication"
  | "dead-code"
  | "size"
  | "dependency-health"
  | "security"
  | "consistency"
  | "test-coverage"
  | "documentation";

export interface AxisDescriptor {
  readonly id: AxisId;
  readonly name: string;
  readonly description: string;
}

export const AXES: ReadonlyMap<AxisId, AxisDescriptor> = new Map([
  [
    "complexity",
    {
      id: "complexity",
      name: "Complexity",
      description:
        "Cyclomatic/cognitive complexity per function and file",
    },
  ],
  [
    "duplication",
    {
      id: "duplication",
      name: "Duplication",
      description: "Copy-paste detection across the codebase",
    },
  ],
  [
    "dead-code",
    {
      id: "dead-code",
      name: "Dead Code",
      description:
        "Unused exports, unreachable code, orphaned files",
    },
  ],
  [
    "size",
    {
      id: "size",
      name: "Size",
      description:
        "Lines of code, file count, function length distribution",
    },
  ],
  [
    "dependency-health",
    {
      id: "dependency-health",
      name: "Dependency Health",
      description: "Dependency graph depth, circular dependencies",
    },
  ],
  [
    "security",
    {
      id: "security",
      name: "Security",
      description: "Known vulnerability patterns (static only)",
    },
  ],
  [
    "consistency",
    {
      id: "consistency",
      name: "Consistency",
      description: "Naming conventions, formatting uniformity",
    },
  ],
  [
    "test-coverage",
    {
      id: "test-coverage",
      name: "Test Coverage",
      description: "Ratio of tested to untested code paths",
    },
  ],
  [
    "documentation",
    {
      id: "documentation",
      name: "Documentation",
      description:
        "Presence and staleness of documentation artifacts",
    },
  ],
]);
