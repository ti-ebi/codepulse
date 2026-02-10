# CodePulse

## Overview

CodePulse is a CLI tool that quantitatively measures the internal quality of source code across multiple dimensions. It is implemented in TypeScript, runs on Node.js >= 18 (ESM), and operates entirely offline.

CodePulse does not analyze code itself. It orchestrates existing specialized tools (scc, jscpd, knip, etc.) through an abstraction layer, unifies their outputs into a consistent format, and presents results through a single interface. Any underlying tool can be swapped without affecting the user-facing interface.

## Vision

AI-assisted development accelerates code generation but also accelerates the accumulation of technical debt, dead code, and hidden complexity. Human review cannot keep pace with AI-generated output. CodePulse provides deterministic, rule-based quality measurement that catches what both humans and AI overlook -- not by competing with AI's generative speed, but by applying deterministic analysis that is reproducible and exhaustive in ways that probabilistic generation is not.

## Target Users

- Developers who want to understand the health of their codebase before and after changes
- AI agents that use CodePulse's measurement results as structured feedback for their own code improvement workflows
- CI/CD pipelines that gate merges on measurable quality criteria

## Technical Stack

- Language: TypeScript (strict mode)
- Runtime: Node.js >= 18
- Module system: ESM (no CommonJS)
- External tools: scc (size/complexity), jscpd (duplication), knip (dead code), and others via adapter pattern

## Architecture Decisions

### Adapter Pattern for External Tools

Every external tool is accessed through an adapter interface. The adapter:
1. Translates CodePulse's internal request format into the tool's CLI invocation
2. Parses the tool's output into CodePulse's normalized data structure
3. Handles tool-specific error cases and unavailability

To add support for a new external tool, implement a new adapter. Never modify existing adapters or the orchestration layer.

### Measurement Axes

CodePulse measures code along these independent axes. Each axis delegates analysis to one or more external tools:

| Axis | Description | External Tool(s) |
|---|---|---|
| Complexity | Cyclomatic/cognitive complexity per function and file | scc |
| Duplication | Copy-paste detection across the codebase | jscpd |
| Dead Code | Unused exports, unreachable code, orphaned files | knip |
| Size | Lines of code, file count, function length distribution | scc |
| Dependency Health | Dependency graph depth, circular dependencies | TBD |
| Security | Known vulnerability patterns (static only) | TBD |
| Consistency | Naming conventions, formatting uniformity | TBD |
| Test Coverage | Ratio of tested to untested code paths | TBD |
| Documentation | Presence and staleness of documentation artifacts | TBD |

Each axis produces a normalized numeric result. Axes are composable -- users can run any subset. "TBD" indicates that the external tool has not yet been selected; the adapter will be implemented when the tool is chosen.

### Output Formats

All output formats share the same underlying data structure:
- **Terminal (compact)** -- summary table for quick review
- **Terminal (rich)** -- detailed breakdown with visual indicators
- **JSON** -- machine-readable, complete data with metric metadata
- **HTML** -- self-contained static file that renders as a dashboard in any browser (no server required)
- **MCP Server** -- exposes measurement results to AI agents via Model Context Protocol (stdio transport)

## Design Principles

These principles are ordered by priority. When two principles conflict, the higher-ranked one wins.

### 1. Measurement Only -- No Modification

CodePulse reads source code and produces numeric measurements. It never modifies, creates, or deletes any file in the target codebase. This boundary is absolute and applies to all future features.

### 2. Offline Execution -- No Data Leaves the Machine

All analysis runs locally. CodePulse never transmits source code, measurement results, or any derived data to servers outside the local machine. There are no opt-in telemetry flags, no anonymous usage reporting, no exceptions. Local inter-process communication (e.g., stdio-based MCP serving to a local AI agent) is not considered data transmission.

### 3. Determinism -- Same Input Produces Same Output

Given identical source code and configuration, CodePulse produces identical output regardless of when or how many times it runs. CodePulse holds no internal state between executions. No caches, no history files, no implicit configuration.

### 4. Orchestration -- No Custom Analysis Engines

CodePulse delegates all code analysis to external tools. If an existing open-source tool provides the needed measurement, CodePulse must use it rather than building a custom implementation. CodePulse's own code is limited to: adapter/integration code, output format transformation, and aggregation of results from multiple tools. CodePulse must not implement its own parser, AST analyzer, or pattern-matching engine.

### 5. Language Uniformity -- One Interface for All Languages

The CLI interface, output structure, and configuration format are identical regardless of the target language. Language-specific behavior is encapsulated within adapters and never surfaces as user-facing flags, subcommands, or output schema differences.

Test: If adding support for a new language requires any change to the CLI interface or output schema, the design is wrong.

### 6. Unified Experience -- Not a Tool Aggregator

CodePulse does not pipe through the raw output of underlying tools. Every result is transformed into CodePulse's own output schema, styled consistently, and presented as a single coherent report. The user should not need to know which underlying tools were used.

### 7. AI Agent Compatibility

Output must be consumable by AI agents without parsing heuristics:
- JSON output includes metric metadata (unit, range, interpretation guidance)
- Filtering flags allow agents to control output volume based on context window constraints
- MCP server integration provides structured access to measurement results
- Error messages are structured and machine-parseable

## Boundaries

These are concrete prohibitions derived from the Design Principles. They must not be violated, even if they seem like natural extensions of existing features.

| Prohibited Action | Derived From | Clarification |
|---|---|---|
| Writing, modifying, or deleting files in the target codebase | Principle #1 | CodePulse may only create files in its own working directory (e.g., report output files) |
| Suggesting or applying code fixes | Principle #1 | Even "optional" auto-fix features are prohibited |
| Sending any data to servers outside the local machine | Principle #2 | Includes telemetry, crash reports, update checks. Local IPC (stdio MCP) is permitted |
| Implementing a parser, AST analyzer, or pattern-matching engine | Principle #4 | Adapter code that maps external tool output to CodePulse's schema is permitted |
| Hosting a persistent HTTP server | Principle scope | HTML output is a static file. MCP transport must use stdio, not HTTP |
| Adding language-specific CLI flags or subcommands | Principle #5 | All language differences are encapsulated in adapters |
| Labeling measurements as "good", "bad", "pass", or "fail" | Neutral measurement | Color coding to indicate numeric magnitude is permitted. Colors visualize scale, not judgment. Thresholds are user-configurable; defaults are starting values, not recommendations |
| Runtime or behavioral analysis of code | Static analysis scope | CodePulse analyzes source code text only. It does not execute, instrument, or observe running code |

## Development Guidelines

### Code Style

- Use TypeScript strict mode with all strict compiler options enabled
- Prefer explicit types over inference at module boundaries (function signatures, exports)
- Use `node:` prefix for Node.js built-in imports
- No default exports -- use named exports exclusively
- Error handling: return Result types for expected failures; throw only for programmer errors

### Adding a New Measurement Axis

1. Define the axis interface in the measurement types module
2. Implement an adapter for the external tool that performs the measurement
3. Register the adapter in the axis registry
4. Add output formatting for all supported output formats
5. Write integration tests that verify deterministic output for known inputs

### Adding Support for a New External Tool

1. Create a new adapter implementing the tool adapter interface
2. Add tool availability detection (check if the tool is installed)
3. Map the tool's output to CodePulse's normalized schema
4. Provide a graceful degradation path when the tool is unavailable
5. Document the tool version requirements

### Testing

- Unit tests: verify individual adapter parsing and normalization logic
- Integration tests: verify end-to-end measurement on fixture codebases
- Determinism tests: run the same measurement twice and assert identical output
- All tests must pass offline with no network access

## AI Agent Team Workflow

CodePulse development uses a three-role team structure that optimizes for quality of judgment, not speed of implementation. The team exists to ensure that every change is worth building, built correctly, and coherent with the whole. Work proceeds through three checkpoints, each owned by a different role, where rejection is cheaper than correction.

### Roles

| Role | Responsibility | Core Question |
|---|---|---|
| Critic | Value judgment -- decides whether a proposed change is worth building by evaluating it against all three target user perspectives (developers, AI agents, CI/CD pipelines) | "Is this worth building?" |
| Builder | Design and implementation -- produces the technical design, writes the code, writes the tests, and ensures CLAUDE.md compliance during construction | "Is this built right?" |
| Integrator | Coherence verification -- ensures the change fits the unified experience across all output formats and maintains consistency with existing behavior | "Does this fit the whole?" |

Testing is the Builder's responsibility. CLAUDE.md compliance is distributed across all three roles, not deferred to a post-hoc review.

### Checkpoints

Every change passes through three sequential checkpoints. A change that fails any checkpoint is rejected or revised before proceeding to the next.

**Checkpoint 1: Before Design (Critic-led)**

The Critic evaluates whether the proposed change delivers value. This is a GO/NO-GO decision. Questions to answer:

- Does at least one target user group benefit from this change?
- Does it conflict with any Design Principle or Boundary?
- Can the value be achieved by configuring existing functionality instead?

If the answer to the third question is yes, the change is rejected. Early rejection prevents wasted implementation effort.

**Checkpoint 2: Before Implementation (Builder-led)**

The Builder presents a technical design for approval. Questions to answer:

- Does the design follow the Architecture Layers (see below)?
- Does it pass all three Scope Tests (see below)?
- Are adapter boundaries respected -- no custom analysis engines?

**Checkpoint 3: Before Merge (Integrator-led)**

The Integrator verifies end-to-end coherence. Questions to answer:

- Do all output formats (terminal compact, terminal rich, JSON, HTML, MCP) produce consistent results?
- Is the user experience identical regardless of target language?
- Does the Boundary Review (see below) pass with no violations?

### Architecture Layers

All CodePulse code belongs to exactly one layer. Dependencies flow downward only.

| Layer | Purpose | May Depend On |
|---|---|---|
| Types | Shared interfaces, result types, configuration schema | Nothing |
| Adapter | Translates external tool I/O to CodePulse types | Types |
| Orchestration | Coordinates adapter invocation and result aggregation | Types, Adapter |
| Formatter | Transforms unified results into output formats | Types |
| CLI | Parses arguments, wires orchestration to formatters | All above |

Test: If a module in a lower layer imports from a higher layer, the design is wrong.

### Scope Tests

Apply these three tests to every proposed change. If any test fails, the change exceeds CodePulse's scope.

**Orchestrator Test.** Does the change delegate analysis to an external tool, or does it implement analysis logic? CodePulse must delegate. If the change introduces pattern matching, AST traversal, or heuristic detection, it fails this test.

**Three-Line Test.** Can the change's adapter logic be summarized as: (1) invoke the external tool, (2) parse its output, (3) map to CodePulse's schema? If the adapter requires more conceptual steps, it is doing too much.

**Delete Test.** If this code were deleted, would CodePulse still function correctly for all other measurement axes? Each axis must be independent. If deleting one axis breaks another, the coupling must be removed.

### Boundary Review

Before merging any change, verify these seven checks derived from the Design Principles:

1. No files in the target codebase are written, modified, or deleted (Principle #1)
2. No data is transmitted outside the local machine (Principle #2)
3. Output is deterministic for identical input (Principle #3)
4. No custom parser, AST analyzer, or pattern-matching engine is introduced (Principle #4)
5. No language-specific CLI flags or subcommands are added (Principle #5)
6. All output uses CodePulse's own schema, not raw tool output (Principle #6)
7. JSON output includes metric metadata and is machine-parseable without heuristics (Principle #7)

### Pre-Commit Checklist

Before committing any change, verify the following:

- [ ] All Scope Tests pass (Orchestrator, Three-Line, Delete)
- [ ] All seven Boundary Review checks pass
- [ ] Unit tests cover adapter parsing and normalization logic
- [ ] Integration tests verify deterministic output on fixture codebases
- [ ] No default exports are introduced
- [ ] TypeScript strict mode produces no errors
- [ ] The change does not require knowledge of which external tool is used
