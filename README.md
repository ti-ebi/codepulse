# CodePulse

Quantitative code quality measurement from the command line.

CodePulse measures the internal quality of source code across multiple dimensions -- complexity, duplication, dead code, dependency health, size, and more. It orchestrates existing specialized tools (scc, jscpd, knip, madge, etc.) through a unified interface, so you get a single coherent report instead of running each tool separately.

## Key Characteristics

- **Measurement only** -- reads code and produces numbers. Never modifies your codebase.
- **Offline** -- all analysis runs locally. No data leaves your machine.
- **Deterministic** -- same input always produces the same output.
- **Language-agnostic** -- one interface regardless of target language.
- **AI-friendly** -- structured JSON output with metric metadata, designed for consumption by AI agents and CI/CD pipelines.

## Measurement Axes

| Axis | What it measures | Powered by |
|---|---|---|
| Complexity | Cyclomatic/cognitive complexity per function and file | [scc](https://github.com/boyter/scc) |
| Duplication | Copy-paste detection across the codebase | [jscpd](https://github.com/kucherenko/jscpd) |
| Dead Code | Unused exports, unreachable code, orphaned files | [knip](https://github.com/webpro-nl/knip) |
| Size | Lines of code, file count, function length distribution | [scc](https://github.com/boyter/scc) |
| Dependency Health | Dependency graph depth, circular dependencies | [madge](https://github.com/pahen/madge) |
| Test Coverage | Ratio of tested to untested code paths | TBD |

## Output Formats

- **Terminal (compact)** -- summary table for quick review
- **Terminal (rich)** -- detailed breakdown with visual indicators
- **JSON** -- machine-readable with metric metadata (unit, range, interpretation guidance)
- **HTML** -- self-contained static dashboard, no server required
- **MCP Server** -- structured access for AI agents via Model Context Protocol (stdio)

## Usage

```
codepulse [options] <target-path>
```

### Options

| Flag | Description |
|---|---|
| `--format <format>` | Output format: `terminal-compact` (default), `terminal-rich`, `json`, `html` |
| `--axis <axis>` | Measurement axis to run (repeatable). Omit to run all available axes |
| `--output <path>` | Write report to file instead of stdout |
| `--mcp` | Start as MCP server (stdio transport) for AI agent integration |
| `--help` | Show help message |
| `--version` | Show version number |

### Examples

```bash
# Measure all available axes, compact output
codepulse ./my-project

# JSON report for complexity and size only
codepulse --format json --axis complexity --axis size ./my-project

# HTML dashboard written to file
codepulse --format html --output report.html ./my-project

# Start as MCP server for AI agent access
codepulse --mcp
```

### MCP Server

Run `codepulse --mcp` to start CodePulse as a Model Context Protocol server using stdio transport. This exposes a `measure` tool that AI agents can call to analyze codebases.

The `measure` tool accepts:
- `targetPath` (required) -- absolute path to the directory to measure
- `axes` (optional) -- array of measurement axes to run

Returns a structured JSON report with full metric metadata (units, ranges, interpretation guidance).

## Technical Stack

- TypeScript (strict mode)
- Node.js >= 18
- ESM only

## Status

Early development. Not yet published to npm.

## License

TBD
