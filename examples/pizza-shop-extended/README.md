# Pizza Shop — Dogfood Example

> Auto-generating WebMCP tools for the `webmcp-kit` pizza-shop example app.

This directory demonstrates running `webmcp-extend` against the [pizza-shop example](https://github.com/nicholasgriffintn/webmcp-kit/tree/main/examples/pizza-shop) from `webmcp-kit` — the same app that has manually-written tools using `defineTool()`.

## What This Proves

The auto-generated tools should closely match the manually-written ones:

| Manual Tool (webmcp-kit) | Auto-Generated Tool (webmcp-extend) | Match |
|--------------------------|-------------------------------------|-------|
| `getMenu`                | `getMenu` (js-call)                 | ✅    |
| `addToCart`              | `addToCart` (dom-action)            | ✅    |
| `getCart`                | `getCart` (js-call)                 | ✅    |
| `clearCart`              | `clearCart` (js-call)               | ✅    |
| `checkout`               | `checkout` (dom-action)             | ✅    |

## How to Run

### Prerequisites

1. Clone and run the pizza-shop example:
   ```bash
   git clone https://github.com/nicholasgriffintn/webmcp-kit
   cd webmcp-kit/examples/pizza-shop
   npm install
   npm run dev  # Starts on http://localhost:3000
   ```

2. Have `webmcp-extend` available:
   ```bash
   cd /path/to/webmcp-extend
   pnpm install
   pnpm build
   ```

### Step 1 — Scan

```bash
npx webmcp-extend scan http://localhost:3000 \
  --scenario "Browse the pizza menu, add items to cart, view cart, and checkout" \
  --output examples/pizza-shop-extended/scan-output.json
```

### Step 2 — Generate (using pre-built proposals)

```bash
npx webmcp-extend generate \
  examples/pizza-shop-extended/scan-output.json \
  --tools examples/pizza-shop-extended/proposals.json \
  --output-dir examples/pizza-shop-extended/extension \
  --name "Pizza Shop WebMCP Tools"
```

### Step 3 — Build

```bash
npx webmcp-extend build examples/pizza-shop-extended/extension
```

### Step 4 — Load in Chrome

1. Open `chrome://extensions`
2. Enable Developer Mode
3. Click "Load unpacked"
4. Select `examples/pizza-shop-extended/extension/dist`
5. Navigate to `http://localhost:3000`
6. Open DevTools and check:
   ```js
   navigator.modelContextTesting.listTools()
   ```

### Step 5 — Export to Kit

```bash
npx webmcp-extend export \
  examples/pizza-shop-extended/extension \
  --output-dir examples/pizza-shop-extended/kit-starter
```

Compare the exported starter code with the original `pizza-shop/src/main.ts` — they should have the same structure, with TODO comments where the original has direct app-state calls.

## Files

- `scan-output.json` — Pre-captured analysis (so you don't need to run the pizza shop)
- `proposals.json` — Tool proposals matching the pizza shop's manual tools
