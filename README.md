<p align="center">
  <strong>CodePulse</strong><br>
  Quantitative code quality measurement from the command line.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node.js >= 18">
  <img src="https://img.shields.io/badge/module-ESM-blue" alt="ESM">
  <img src="https://img.shields.io/badge/lang-TypeScript-blue" alt="TypeScript">
  <img src="https://img.shields.io/badge/version-0.1.0-orange" alt="Version 0.1.0">
  <img src="https://img.shields.io/badge/license-TBD-lightgrey" alt="License: TBD">
</p>

---

CodePulse measures the internal quality of source code across multiple dimensions -- complexity, duplication, dead code, dependency health, security, consistency, test coverage, documentation, and size. It orchestrates existing specialized tools (scc, jscpd, knip, madge, Semgrep, ESLint, c8, TypeDoc) through a unified interface, so you get a single coherent report instead of running each tool separately.

## Key Characteristics

- **Measurement only** -- reads code and produces numbers. Never modifies your codebase.
- **Offline** -- all analysis runs locally. No data leaves your machine.
- **Deterministic** -- same input always produces the same output.
- **Language-agnostic** -- one interface regardless of target language.
- **AI-friendly** -- structured JSON output with metric metadata, designed for consumption by AI agents and CI/CD pipelines.

---

## Measurement Axes

| Axis | What it measures | Powered by |
|---|---|---|
| **Complexity** | Cyclomatic/cognitive complexity per function and file | [scc](https://github.com/boyter/scc) |
| **Duplication** | Copy-paste detection across the codebase | [jscpd](https://github.com/kucherenko/jscpd) |
| **Dead Code** | Unused exports, unreachable code, orphaned files | [knip](https://github.com/webpro-nl/knip) |
| **Size** | Lines of code, file count, function length distribution | [scc](https://github.com/boyter/scc) |
| **Dependency Health** | Dependency graph depth, circular dependencies | [madge](https://github.com/pahen/madge) |
| **Security** | Known vulnerability patterns (static only) | [Semgrep](https://semgrep.dev/) |
| **Consistency** | Naming conventions, formatting uniformity | [ESLint](https://eslint.org/) |
| **Test Coverage** | Line, statement, function, and branch coverage | [c8](https://github.com/bcoe/c8) |
| **Documentation** | Documentation coverage of exported symbols | [TypeDoc](https://typedoc.org/) |

Each axis is independent -- run any subset or all at once.

---

## Output Formats

| Format | Description |
|---|---|
| **Terminal (compact)** | Summary table for quick review |
| **Terminal (rich)** | Detailed breakdown with visual indicators |
| **JSON** | Machine-readable with metric metadata (unit, range, interpretation guidance) |
| **HTML** | Self-contained static dashboard, no server required |
| **MCP Server** | Structured access for AI agents via Model Context Protocol (stdio) |

---

## Usage

```
codepulse [options] <target-path>
```

### Options

| Flag | Description |
|---|---|
| `--format <format>` | Output format: `terminal-compact` (default), `terminal-rich`, `json`, `html` |
| `--axis <axis>` | Measurement axis to run (repeatable). Omit to run all available axes |
| `--output <path>` | Write report to file instead of stdout. Format is inferred from `.json`/`.html` extension if `--format` is omitted |
| `--mcp` | Start as MCP server (stdio transport) for AI agent integration |
| `--list-axes` | List available measurement axes with descriptions |
| `--help` | Show help message |
| `--version` | Show version number |

### Available Axes

`complexity` `duplication` `dead-code` `size` `dependency-health` `security` `consistency` `test-coverage` `documentation`

### Examples

```bash
# Measure all available axes, compact output
codepulse ./my-project

# JSON report for complexity and size only
codepulse --format json --axis complexity --axis size ./my-project

# HTML dashboard written to file (format inferred from .html extension)
codepulse --output report.html ./my-project

# Rich terminal output for security and dead code
codepulse --format terminal-rich --axis security --axis dead-code ./src

# List available measurement axes
codepulse --list-axes

# Start as MCP server for AI agent access
codepulse --mcp
```

---

## MCP Server

Run `codepulse --mcp` to start CodePulse as a Model Context Protocol server using stdio transport. This exposes a `measure` tool that AI agents can call to analyze codebases.

The `measure` tool accepts:
- `targetPath` (required) -- absolute path to the directory to measure
- `axes` (optional) -- array of measurement axes to run

Returns a structured JSON report with full metric metadata (units, ranges, interpretation guidance).

---

## Architecture

```
CLI  ──>  Formatter  ──>  Orchestration  ──>  Adapters  ──>  Types
```

- **Types** -- shared interfaces, result types, configuration schema
- **Adapters** -- translate external tool I/O to CodePulse types (one adapter per tool)
- **Orchestration** -- coordinates adapter invocation and result aggregation
- **Formatters** -- transform unified results into output formats
- **CLI** -- parses arguments, wires orchestration to formatters

Dependencies flow strictly downward. Each measurement axis is independent and can be added or removed without affecting others.

---

## Technical Stack

- **TypeScript** -- strict mode with all strict compiler options
- **Node.js** >= 18
- **ESM** only (no CommonJS)

---

## Status

Early development. Not yet published to npm.

## License

TBD
