# webmcp-extend

**Autopilot WebMCP tools onto any website. Then build it for real.**

`webmcp-extend` generates [WebMCP](https://nicholasgriffintn.github.io/webmcp-kit/) tools for _any_ website automatically. Point it at a URL, describe what an AI agent should do, and get a ready-to-load Chrome Extension that exposes those tools via `navigator.modelContext`. When you're ready to go native, export to clean [webmcp-kit](https://github.com/nicholasgriffintn/webmcp-kit) starter code.

> **The thesis:** once developers see AI agent tools working on their own site in 5 minutes, they'll be motivated to implement WebMCP natively. **extend** is the gateway. **kit** is the destination.

## Quick Start

```bash
# 1. Scan a website
npx webmcp-extend scan https://pizza-shop.example.com \
  --scenario "Browse menu, add to cart, checkout" \
  --output scan.json

# 2. Review the proposal prompt in scan.json, generate tool proposals
#    (Your AI coding agent does this via the SKILL.md workflow)

# 3. Generate a Chrome Extension from proposals
npx webmcp-extend generate scan.json \
  --tools proposals.json \
  --output-dir ./my-extension

# 4. Build the extension
npx webmcp-extend build ./my-extension

# 5. Load in Chrome: chrome://extensions → Load unpacked → my-extension/dist

# 6. When ready, export to native webmcp-kit code
npx webmcp-extend export ./my-extension --output-dir ./native-tools
```

## How It Works

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌────────────────┐
│   Scan 🔍   │───▶│  Analyze 🧠  │───▶│  Generate 🛠️ │───▶│   Load 🧩      │
│  Playwright  │    │  DOM + JS    │    │  defineTool() │    │  Chrome Ext    │
│  crawls site │    │  extraction  │    │  Extension    │    │  loads tools   │
└─────────────┘    └──────────────┘    └──────────────┘    └────────┬───────┘
                                                                     │
                                                                     ▼
                                                            ┌────────────────┐
                                                            │  Export 📦     │
                                                            │  → webmcp-kit  │
                                                            │  starter code  │
                                                            └────────────────┘
```

### 1. Scan (`analysis/`)
Playwright crawls the target URL, captures:
- **Accessibility tree** — semantic structure of the page
- **DOM structure** — interactive elements (buttons, forms, inputs) with CSS selectors
- **JS surface** — global functions (`window.*`), data layers (`__NEXT_DATA__`, `dataLayer`), event handlers
- **Screenshots** — visual capture at each step

### 2. Analyze (`propose-tools.ts`)
Builds a structured prompt from the scan results. An AI coding agent (via the [SKILL.md](skills/generate-webmcp-extension/SKILL.md) workflow) reasons over this prompt to propose tool definitions.

### 3. Generate (`generator/`)
From approved proposals, generates:
- **TypeScript tool files** using `defineTool()` from webmcp-kit
- **Zod input schemas** with proper types, constraints, and descriptions
- **Chrome Extension** (Manifest V3) with content scripts, background worker, and MAIN world injector
- **Nudge banner** — "Built with webmcp-extend. Go native with webmcp-kit →"

### 4. Load
Install the generated extension as an unpacked Chrome Extension. Tools register via `navigator.modelContext` (native WebMCP) or webmcp-kit's mock layer.

### 5. Export
When ready to go native, convert auto-generated shim tools into clean webmcp-kit starter code with TODO comments for proper app integration.

## Agent Skill

The primary workflow is driven by an AI coding agent using the [SKILL.md](skills/generate-webmcp-extension/SKILL.md) skill file (compatible with [skills.sh](https://skills.sh)).

The agent:
1. Asks for the target URL and scenario
2. Runs the scan pipeline
3. Reasons over the analysis to propose tools
4. Presents proposals for user review
5. Generates and builds the extension
6. Guides testing and suggests the export-to-kit path

## CLI Reference

### `webmcp-extend scan <url>`

Crawl a website and analyze its DOM + JS surface.

| Option | Description |
|--------|-------------|
| `-s, --scenario <text>` | Scenario description for context |
| `--steps <json>` | JSON array of scenario steps to execute |
| `-o, --output <file>` | Output file (default: stdout) |
| `--no-screenshots` | Skip screenshot capture |
| `--headful` | Run browser visibly |

### `webmcp-extend generate <analysis.json>`

Generate a Chrome Extension from scan results + tool proposals.

| Option | Description |
|--------|-------------|
| `-t, --tools <file>` | Path to tool proposals JSON (required) |
| `-o, --output-dir <dir>` | Output directory (default: `./webmcp-extension`) |
| `-n, --name <name>` | Extension name |

### `webmcp-extend build <dir>`

Bundle a generated extension with Vite.

### `webmcp-extend export <dir>`

Convert generated tools to webmcp-kit starter code.

| Option | Description |
|--------|-------------|
| `-o, --output-dir <dir>` | Output directory (default: `./webmcp-kit-starter`) |

## Programmatic API

```typescript
import {
  // Analysis
  crawlSite,
  extractDOM,
  extractJS,
  buildToolProposalPrompt,
  parseToolProposals,

  // Generator
  generateToolFiles,
  generateToolManifest,
  generateExtension,
  exportToKit,
} from "webmcp-extend";
```

## Architecture

```
webmcp-extend/
├── src/
│   ├── analysis/
│   │   ├── crawl.ts           # Playwright page crawler
│   │   ├── extract-dom.ts     # DOM / a11y tree extraction
│   │   ├── extract-js.ts      # JS surface detection
│   │   ├── propose-tools.ts   # Structured prompt builder
│   │   └── types.ts           # Shared types
│   ├── generator/
│   │   ├── generate-tools.ts      # Emits defineTool() files
│   │   ├── generate-manifest.ts   # URL pattern → tool mapping
│   │   ├── generate-extension.ts  # Chrome Extension scaffolder
│   │   └── export-to-kit.ts      # Converts to webmcp-kit starter
│   ├── cli.ts                 # CLI entry point (commander)
│   └── index.ts               # Programmatic API
├── extension-template/
│   ├── manifest.json          # Manifest V3 template
│   ├── background.ts          # Service worker
│   ├── content-script.ts      # ISOLATED world (tool registration)
│   ├── injector-main-world.ts # MAIN world (page JS access)
│   └── nudge-banner.ts        # "Go native" nudge
├── skills/
│   └── generate-webmcp-extension/
│       └── SKILL.md           # Agent skill workflow
├── tests/
│   ├── analysis/
│   ├── generator/
│   └── e2e/
└── examples/
    └── pizza-shop-extended/   # Dogfood example
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Separate repo** from webmcp-kit | Different dependencies (Playwright ~300MB), release lifecycle, audience |
| **Playwright** for crawling | Full control, no MCP server overhead, accessibility tree support |
| **defineTool() from webmcp-kit** | Ecosystem consistency, pre-familiarizes developers with the kit API |
| **Prompt builder, not LLM caller** | `propose-tools.ts` builds the prompt; the agent's own LLM reasons over it. No LLM SDK dependency. |
| **MAIN + ISOLATED world** | JS-call tools need page context (MAIN); tool registration uses ISOLATED. Communication via postMessage. |
| **Dual strategy** (JS call + DOM action) | Prefer calling page functions when detected; fall back to DOM for elements without APIs |
| **Conversion funnel** | Nudge banner, export-to-kit, README all drive extend → kit |

## Don't Have WebMCP Tools Yet?

`webmcp-extend` lets you see what's possible in 5 minutes. When you're ready to build production-grade tools:

👉 **[webmcp-kit](https://github.com/nicholasgriffintn/webmcp-kit)** — The library for building native WebMCP tools.

```bash
npx webmcp-extend export ./my-extension --output-dir ./start-here
```

The exported code gives you a head start with proper `defineTool()` structure, Zod schemas, and TODO comments showing exactly where to wire in your app's real state and APIs.

## License

MIT
