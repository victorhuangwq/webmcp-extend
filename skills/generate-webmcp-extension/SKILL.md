---
name: generate-webmcp-extension
description: Generate WebMCP tools for any website. Use when the user wants to create AI agent tools for a URL, build a Chrome extension with WebMCP tools, or autopilot WebMCP onto a site.
---

# Generate WebMCP Extension

End-to-end WebMCP tool generation. Crawl a website, analyze its surface, propose tools, and scaffold a Chrome Extension that injects them automatically.

## Prerequisites

- Node.js 20+
- `webmcp-extend` installed globally or available via npx
- Playwright browsers installed (`npx playwright install chromium`)

## Workflow

### Step 1 — Gather Input

Ask the user for:

1. **Target URL** — The website to generate tools for
2. **Scenario description** — What an AI agent should be able to do on this site (e.g., "Search for flights, select one, and book it")
3. *(Optional)* **Specific steps** — If the user can describe the click-by-click flow

**Example exchange:**
```
You: What website would you like to generate WebMCP tools for?
User: https://pizza-shop.example.com
You: What should an AI agent be able to do on this site?
User: Browse the menu, add pizzas to cart, view cart, and checkout
```

### Step 2 — Scan the Site

Run the analysis pipeline:

```bash
npx webmcp-extend scan "https://pizza-shop.example.com" \
  --scenario "Browse the menu, add pizzas to cart, view cart, and checkout" \
  --output scan-result.json
```

If the user provided specific steps, include them:

```bash
npx webmcp-extend scan "https://pizza-shop.example.com" \
  --scenario "Order a pizza" \
  --steps '[{"action":"click","selector":"#menu-tab"},{"action":"click","selector":".pizza-card:first-child .add-btn"}]' \
  --output scan-result.json
```

**What happens:** Playwright opens a browser, navigates to the URL, captures the accessibility tree, DOM structure, screenshots, and JavaScript surface (global functions, data layers, event handlers).

### Step 3 — Review Analysis & Propose Tools

Read the `scan-result.json` file, specifically the `proposalPrompt` field. This contains a structured summary of:
- Interactive DOM elements grouped by page region
- JavaScript functions and APIs detected on `window`
- Data layers (Next.js, Redux, GTM, etc.)
- Inline event handlers

**Your task:** Reason over this prompt and propose tool definitions. For each tool:

1. **Name** — camelCase, action-oriented (e.g., `getMenu`, `addToCart`, `searchFlights`)
2. **Description** — What the tool does, from the AI agent's perspective
3. **Input schema** — Parameters the agent needs to provide
4. **Action type** — `js-call` if a global function was detected, `dom-action` if the tool needs to interact with DOM elements
5. **Action details** — Which function to call or which DOM elements to interact with
6. **Annotations** — `readOnlyHint` for getters, `destructiveHint` for deletions, `confirmationHint` for purchases

**Guidelines:**
- Prefer `js-call` over `dom-action` when a suitable function exists on `window`
- Group related form fields into a single tool (don't make separate tools for each input)
- Include both read tools (getMenu, getCart) and write tools (addToCart, checkout)
- Set annotations correctly — they help the AI agent make safe decisions

**Output format:** Save proposals as a JSON array:

```json
[
  {
    "name": "getMenu",
    "description": "Get the pizza menu with available pizzas, sizes, and prices",
    "inputSchema": {
      "type": "object",
      "properties": {},
      "required": []
    },
    "actionType": "js-call",
    "actionDetails": {
      "functionPath": "window.getMenu",
      "argMapping": [],
      "returnType": "object"
    },
    "annotations": {
      "readOnlyHint": true
    }
  },
  {
    "name": "addToCart",
    "description": "Add a pizza to the shopping cart",
    "inputSchema": {
      "type": "object",
      "properties": {
        "pizzaId": { "type": "string", "description": "Pizza ID from the menu" },
        "quantity": { "type": "number", "description": "Number to add", "minimum": 1, "maximum": 10 },
        "size": { "type": "string", "description": "Pizza size", "enum": ["small", "medium", "large"] }
      },
      "required": ["pizzaId", "quantity"]
    },
    "actionType": "dom-action",
    "actionDetails": {
      "steps": [
        { "action": "select", "selector": "#pizza-select", "inputProperty": "pizzaId" },
        { "action": "fill", "selector": "#quantity-input", "inputProperty": "quantity" },
        { "action": "click", "selector": "#add-to-cart-btn" }
      ]
    },
    "annotations": {
      "readOnlyHint": false
    }
  }
]
```

### Step 4 — Present to User for Review

Show the proposed tools in a readable format:

```
📋 Proposed Tools for pizza-shop.example.com:

| # | Tool          | Type       | Description                              | Annotations          |
|---|---------------|------------|------------------------------------------|----------------------|
| 1 | getMenu       | js-call    | Get the pizza menu                       | readOnly             |
| 2 | addToCart      | dom-action | Add a pizza to the cart                  | —                    |
| 3 | getCart        | js-call    | View current cart contents               | readOnly             |
| 4 | clearCart      | js-call    | Remove all items from cart               | destructive          |
| 5 | checkout       | dom-action | Complete purchase                        | confirmation         |

Would you like to modify any tools? (add/remove/edit)
```

Apply any user edits, then save to `proposals.json`.

### Step 5 — Generate the Extension

```bash
npx webmcp-extend generate scan-result.json \
  --tools proposals.json \
  --output-dir ./my-pizza-extension \
  --name "Pizza Shop WebMCP Tools"
```

**What happens:** Creates a complete Chrome Extension directory with:
- Individual tool `.ts` files with `defineTool()` definitions
- `manifest.json` configured for the target URL pattern
- Background service worker for URL matching
- Content script for tool registration
- MAIN world injector (if any tools use `js-call`)
- Nudge banner linking to webmcp-kit
- `vite.config.ts` for building

### Step 6 — Build the Extension

```bash
cd my-pizza-extension
npm install
npm run build
# or: npx webmcp-extend build ./my-pizza-extension
```

### Step 7 — Test

Guide the user:

1. Open Chrome → `chrome://extensions`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked" → select the `my-pizza-extension/dist` folder
4. Navigate to the target site
5. Open DevTools Console and run:
   ```js
   navigator.modelContextTesting.listTools()
   ```
6. Verify the expected tools appear
7. Test a tool:
   ```js
   await navigator.modelContextTesting.executeTool("getMenu", "{}")
   ```

### Step 8 — Suggest Next Steps

After successful testing, present the conversion path:

```
✅ Tools are working! Here's what's next:

🔧 **Keep using the extension** — It works as-is for development and demos.

📦 **Export to webmcp-kit** — Convert to production-grade native tools:
   npx webmcp-extend export ./my-pizza-extension --output-dir ./my-native-tools

   This creates clean starter code with TODO comments where you need
   to wire in your app's real state and APIs.

📖 **Learn webmcp-kit** — https://github.com/nicholasgriffintn/webmcp-kit
   Native tools are faster, more reliable, and don't need an extension.
```

---

## Playbooks

### Adding Tools to an Existing Extension

1. Re-run scan for the page that needs new tools
2. Propose additional tools
3. Save to `additional-proposals.json`
4. Run generate with `--merge` flag (manually add tool files to existing extension)
5. Rebuild

### Debugging Tool Failures

Common issues:
- **"Element not found"** — The CSS selector may have changed. Re-scan the page and check selectors.
- **"Function not available"** — The page JS may have changed or the function is loaded async. Add a wait step or check load timing.
- **Tool registered but not working** — Check if the tool needs MAIN world access (js-call tools do).

### Updating After Site Changes

1. Re-run `npx webmcp-extend scan` to capture the current state
2. Compare the new analysis with the original
3. Update tool proposals as needed
4. Re-generate the extension

### Exporting to webmcp-kit

```bash
npx webmcp-extend export ./my-extension --output-dir ./kit-starter
```

Then for each exported file:
1. Replace `// TODO: Replace DOM query with your app's state or API` with actual app logic
2. Replace `// TODO: Replace window function call` with direct imports from your app
3. Remove DOM selectors and use your app's state management
4. Test with `enableDevMode()` from `webmcp-kit/devtools`

---

## File Reference

| File | Purpose |
|------|---------|
| `scan-result.json` | Full site analysis from the scan step |
| `proposals.json` | Tool proposals (agent-generated, user-approved) |
| `my-extension/` | Generated extension directory |
| `my-extension/tools/` | Individual tool definition files |
| `my-extension/manifest.json` | Chrome Extension manifest |
| `my-extension/tool-manifest.json` | URL pattern → tool mapping |
| `kit-starter/` | Exported webmcp-kit starter code |
