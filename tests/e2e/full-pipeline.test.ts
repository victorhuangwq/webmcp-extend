/**
 * End-to-end test for the full pipeline:
 * Scan (with fixture) → Propose → Generate → Verify structure
 *
 * This test doesn't use Playwright to crawl a real site — instead it
 * uses fixture data to test the generate → build pipeline.
 */
import { describe, it, expect, afterAll } from "vitest";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { generateToolFiles } from "../../src/generator/generate-tools.js";
import { generateToolManifest } from "../../src/generator/generate-manifest.js";
import { generateExtension } from "../../src/generator/generate-extension.js";
import { exportToKit } from "../../src/generator/export-to-kit.js";
import type { ToolProposal } from "../../src/analysis/types.js";

const TEST_OUTPUT_DIR = join(import.meta.dirname ?? __dirname, "../.test-output/e2e");

const pizzaShopProposals: ToolProposal[] = [
  {
    name: "getMenu",
    description: "Get the pizza menu with all available pizzas, prices, and toppings",
    inputSchema: { type: "object", properties: {}, required: [] },
    actionType: "js-call",
    actionDetails: {
      functionPath: "window.getMenu",
      argMapping: [],
      returnType: "object",
    },
    annotations: { readOnlyHint: true },
    urlPattern: "https://pizza.example.com/*",
  },
  {
    name: "addToCart",
    description: "Add a pizza to the shopping cart",
    inputSchema: {
      type: "object",
      properties: {
        pizzaId: { type: "string", description: "The pizza ID from the menu" },
        quantity: { type: "number", description: "Number of pizzas", minimum: 1, maximum: 10 },
        size: { type: "string", description: "Pizza size", enum: ["small", "medium", "large"] },
      },
      required: ["pizzaId", "quantity"],
    },
    actionType: "dom-action",
    actionDetails: {
      steps: [
        { action: "fill", selector: "#pizza-select", inputProperty: "pizzaId" },
        { action: "fill", selector: "#quantity", inputProperty: "quantity" },
        { action: "select", selector: "#size", inputProperty: "size" },
        { action: "click", selector: "#add-to-cart" },
      ],
    },
  },
  {
    name: "getCart",
    description: "Get current cart contents and total",
    inputSchema: { type: "object", properties: {} },
    actionType: "js-call",
    actionDetails: {
      functionPath: "window.cart.getItems",
      argMapping: [],
      returnType: "object",
    },
    annotations: { readOnlyHint: true },
    urlPattern: "https://pizza.example.com/*",
  },
  {
    name: "clearCart",
    description: "Remove all items from the cart",
    inputSchema: { type: "object", properties: {} },
    actionType: "js-call",
    actionDetails: {
      functionPath: "window.cart.clear",
      argMapping: [],
      returnType: "void",
    },
    annotations: { destructiveHint: true },
    urlPattern: "https://pizza.example.com/*",
  },
  {
    name: "checkout",
    description: "Complete the purchase with delivery info",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Customer name" },
        address: { type: "string", description: "Delivery address" },
        phone: { type: "string", description: "Contact phone" },
      },
      required: ["name", "address"],
    },
    actionType: "dom-action",
    actionDetails: {
      steps: [
        { action: "fill", selector: "#name", inputProperty: "name" },
        { action: "fill", selector: "#address", inputProperty: "address" },
        { action: "fill", selector: "#phone", inputProperty: "phone" },
        { action: "click", selector: "#checkout-btn" },
      ],
    },
    annotations: { confirmationHint: true },
    urlPattern: "https://pizza.example.com/*",
  },
];

afterAll(() => {
  if (existsSync(TEST_OUTPUT_DIR)) {
    rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
  }
});

describe("Full pipeline (fixture-based)", () => {
  it("generates tool files from proposals", () => {
    const toolFiles = generateToolFiles(pizzaShopProposals);

    expect(toolFiles).toHaveLength(5);
    expect(toolFiles.map((f) => f.path)).toEqual([
      "tools/getMenu.ts",
      "tools/addToCart.ts",
      "tools/getCart.ts",
      "tools/clearCart.ts",
      "tools/checkout.ts",
    ]);

    // Each file should be valid-looking TypeScript
    for (const file of toolFiles) {
      expect(file.content).toContain("defineTool");
      expect(file.content).toContain("webmcp-kit");
      expect(file.content).toContain("zod");
    }
  });

  it("generates manifest mapping URL patterns to tools", () => {
    const manifest = generateToolManifest(pizzaShopProposals, {
      extensionName: "webmcp-pizza-shop",
      defaultPattern: "https://pizza.example.com/*",
    });

    expect(manifest.extensionName).toBe("webmcp-pizza-shop");
    expect(manifest.toolNames).toHaveLength(5);
    expect(manifest.patterns["https://pizza.example.com/*"]).toHaveLength(5);
  });

  it("scaffolds complete extension directory", () => {
    const toolFiles = generateToolFiles(pizzaShopProposals);
    const manifest = generateToolManifest(pizzaShopProposals, {
      extensionName: "webmcp-pizza-shop",
      defaultPattern: "https://pizza.example.com/*",
    });

    const extDir = join(TEST_OUTPUT_DIR, "pizza-extension");
    generateExtension(manifest, toolFiles, pizzaShopProposals, extDir, {
      name: "Pizza Shop WebMCP Tools",
    });

    // Core files
    expect(existsSync(join(extDir, "manifest.json"))).toBe(true);
    expect(existsSync(join(extDir, "package.json"))).toBe(true);
    expect(existsSync(join(extDir, "vite.config.ts"))).toBe(true);
    expect(existsSync(join(extDir, "tsconfig.json"))).toBe(true);

    // Tool files
    expect(existsSync(join(extDir, "tools/getMenu.ts"))).toBe(true);
    expect(existsSync(join(extDir, "tools/addToCart.ts"))).toBe(true);
    expect(existsSync(join(extDir, "tools/getCart.ts"))).toBe(true);
    expect(existsSync(join(extDir, "tools/clearCart.ts"))).toBe(true);
    expect(existsSync(join(extDir, "tools/checkout.ts"))).toBe(true);
    expect(existsSync(join(extDir, "tools/index.ts"))).toBe(true);

    // Template files
    expect(existsSync(join(extDir, "src/background.ts"))).toBe(true);
    expect(existsSync(join(extDir, "src/content-script.ts"))).toBe(true);

    // Manifest content
    const manifestJson = JSON.parse(readFileSync(join(extDir, "manifest.json"), "utf-8"));
    expect(manifestJson.manifest_version).toBe(3);
    expect(manifestJson.name).toBe("Pizza Shop WebMCP Tools");

    // Has MAIN world entry (because getMenu is js-call)
    const mainWorldScripts = manifestJson.content_scripts.filter(
      (cs: Record<string, unknown>) => cs.world === "MAIN",
    );
    expect(mainWorldScripts.length).toBeGreaterThan(0);
  });

  it("exports to clean webmcp-kit starter code", () => {
    const toolFiles = generateToolFiles(pizzaShopProposals);
    const kitFiles = exportToKit(toolFiles);

    expect(kitFiles).toHaveLength(5);

    // Paths should be under webmcp-tools/
    for (const file of kitFiles) {
      expect(file.path).toMatch(/^webmcp-tools\//);
    }

    // Content should have TODO comments instead of DOM selectors
    const addToCartKit = kitFiles.find((f) => f.path.includes("addToCart"));
    expect(addToCartKit).toBeDefined();
    expect(addToCartKit!.content).toContain("TODO");
    expect(addToCartKit!.content).not.toContain("document.querySelector");

    // JS-call tools should have TODO for window functions
    const getMenuKit = kitFiles.find((f) => f.path.includes("getMenu"));
    expect(getMenuKit).toBeDefined();
    expect(getMenuKit!.content).toContain("TODO");

    // All files should preserve webmcp-kit imports
    for (const file of kitFiles) {
      expect(file.content).toContain("webmcp-kit");
      expect(file.content).toContain("defineTool");
    }
  });

  it("generates all five pizza-shop tool names matching the original", () => {
    const manifest = generateToolManifest(pizzaShopProposals, {
      extensionName: "webmcp-pizza-shop",
    });

    // These should closely match the manually-written pizza-shop tools
    const expectedTools = ["getMenu", "addToCart", "getCart", "clearCart", "checkout"];
    expect(manifest.toolNames).toEqual(expectedTools);
  });
});
