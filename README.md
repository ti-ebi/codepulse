# CodePulse

Quantitative code quality measurement from the command line.

CodePulse measures the internal quality of source code across multiple dimensions -- complexity, duplication, dead code, size, and more. It orchestrates existing specialized tools (scc, jscpd, knip, etc.) through a unified interface, so you get a single coherent report instead of running each tool separately.

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
| Dependency Health | Dependency graph depth, circular dependencies | TBD |
| Test Coverage | Ratio of tested to untested code paths | TBD |

## Output Formats

- **Terminal (compact)** -- summary table for quick review
- **Terminal (rich)** -- detailed breakdown with visual indicators
- **JSON** -- machine-readable with metric metadata (unit, range, interpretation guidance)
- **HTML** -- self-contained static dashboard, no server required
- **MCP Server** -- structured access for AI agents via Model Context Protocol (stdio)

## Technical Stack

- TypeScript (strict mode)
- Node.js >= 18
- ESM only

## Status

Early development. Not yet published to npm.

## License

TBD
