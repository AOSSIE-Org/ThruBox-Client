# AGENTS.md

Instructions for AI coding agents working in this repository.

## Project Overview

ThruBox Client is a zero-runtime-dependency TypeScript SDK for the [ThruBox Server](https://github.com/AOSSIE-Org/ThruBox-Server), a self-hostable encrypted message relay. The SDK sends, receives, and manages encrypted messages over the relay's REST API. Works in Node.js 18+ and modern browsers.

## Repository Layout

- `src/` — SDK source (TypeScript)
- `tests/` — Vitest test suite
- `public/` — logo assets referenced by README
- `brand/` — logo, favicons, and brand guidelines (see `brand/Brand.md`)

## Build, Test & Lint

```bash
npm install
npm run build          # tsup — builds ESM + CJS with type declarations
npm test               # vitest run
npm run test:watch     # vitest watch mode
npm run coverage       # vitest run --coverage
npm run lint           # eslint src/ tests/
npm run format         # prettier --write
npm run format:check   # prettier --check
```

## Hard Constraints

- **Zero runtime dependencies.** Only `devDependencies` may be added for build/test tooling — never add a runtime dependency without discussing it in an issue first. This is enforced by `.coderabbit.yaml` review rules.
- The package must keep shipping both ESM and CJS builds with TypeScript declarations (via `tsup`) — don't introduce APIs that only work in one module format.
- Use the native `fetch` API rather than an HTTP client library, to stay dependency-free and work in both Node and browsers.

## Conventions

- New functionality needs tests in `tests/` using Vitest.
- Errors are typed (specific error classes for rate limiting, payload size, not found, etc.) — follow this pattern for new failure modes rather than throwing generic `Error`.
