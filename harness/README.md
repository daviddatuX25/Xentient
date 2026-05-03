# Xentient Harness

Intelligence layer between hardware sensors/actuators and Cloud AI providers.

## Dual Entry Points (Transition Period)

During the MCP architecture transition, Xentient has two runtime modes:

1. **Monolith** (`npm run dev` or `npm run dev:monolith`) — Original `index.ts` entry point. Pipeline runs in-process.
2. **MCP Split** (`npm run dev:core` + `npm run dev:brain`) — Core and Brain run as separate processes connected via MCP stdio.

Once the MCP path is validated end-to-end, the monolith entry point will be deprecated.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start monolith (index.ts) with hot-reload |
| `npm run dev:monolith` | Alias for `dev` |
| `npm run dev:core` | Start core process with hot-reload |
| `npm run dev:brain` | Start brain-basic process with hot-reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled monolith |
| `npm run start:core` | Run compiled core |
| `npm run start:brain` | Run compiled brain-basic |
| `npm test` | Run tests once |
| `npm run test:watch` | Run tests in watch mode |