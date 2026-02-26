/**
 * Tests for generate-extension.ts — Chrome Extension scaffolding.
 */
import { describe, it, expect, afterEach } from "vitest";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { generateExtension } from "../../src/generator/generate-extension.js";
import { generateToolFiles } from "../../src/generator/generate-tools.js";
import { generateToolManifest } from "../../src/generator/generate-manifest.js";
import type { ToolProposal } from "../../src/analysis/types.js";

const TEST_OUTPUT_DIR = join(import.meta.dirname ?? __dirname, "../.test-output/extension");

const sampleProposals: ToolProposal[] = [
  {
    name: "getMenu",
    description: "Get the pizza menu",
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
    description: "Add a pizza to the cart",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Pizza ID" },
      },
      required: ["id"],
    },
    actionType: "dom-action",
    actionDetails: {
      steps: [
        { action: "click", selector: ".add-btn" },
      ],
    },
    urlPattern: "https://pizza.example.com/*",
  },
];

afterEach(() => {
  // Clean up test output
  if (existsSync(TEST_OUTPUT_DIR)) {
    rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
  }
});

describe("generateExtension", () => {
  it("creates a valid extension directory structure", () => {
    const toolFiles = generateToolFiles(sampleProposals);
    const manifest = generateToolManifest(sampleProposals, {
      extensionName: "test-extension",
    });

    generateExtension(manifest, toolFiles, sampleProposals, TEST_OUTPUT_DIR);

    // Verify directory structure
    expect(existsSync(join(TEST_OUTPUT_DIR, "manifest.json"))).toBe(true);
    expect(existsSync(join(TEST_OUTPUT_DIR, "package.json"))).toBe(true);
    expect(existsSync(join(TEST_OUTPUT_DIR, "vite.config.ts"))).toBe(true);
    expect(existsSync(join(TEST_OUTPUT_DIR, "tsconfig.json"))).toBe(true);
    expect(existsSync(join(TEST_OUTPUT_DIR, "tool-manifest.json"))).toBe(true);
    expect(existsSync(join(TEST_OUTPUT_DIR, "tools/getMenu.ts"))).toBe(true);
    expect(existsSync(join(TEST_OUTPUT_DIR, "tools/addToCart.ts"))).toBe(true);
    expect(existsSync(join(TEST_OUTPUT_DIR, "tools/index.ts"))).toBe(true);
  });

  it("generates valid manifest.json", () => {
    const toolFiles = generateToolFiles(sampleProposals);
    const manifest = generateToolManifest(sampleProposals, {
      extensionName: "test-extension",
    });

    generateExtension(manifest, toolFiles, sampleProposals, TEST_OUTPUT_DIR);

    const manifestJson = JSON.parse(
      readFileSync(join(TEST_OUTPUT_DIR, "manifest.json"), "utf-8"),
    );

    expect(manifestJson.manifest_version).toBe(3);
    expect(manifestJson.name).toBe("test-extension");
    expect(manifestJson.permissions).toContain("activeTab");
    expect(manifestJson.background.service_worker).toBe("dist/background.js");
    expect(manifestJson.content_scripts.length).toBeGreaterThan(0);
  });

  it("includes MAIN world injector when js-call tools exist", () => {
    const toolFiles = generateToolFiles(sampleProposals);
    const manifest = generateToolManifest(sampleProposals, {
      extensionName: "test-extension",
    });

    generateExtension(manifest, toolFiles, sampleProposals, TEST_OUTPUT_DIR);

    const manifestJson = JSON.parse(
      readFileSync(join(TEST_OUTPUT_DIR, "manifest.json"), "utf-8"),
    );

    const mainWorldScripts = manifestJson.content_scripts.filter(
      (cs: Record<string, unknown>) => cs.world === "MAIN",
    );
    expect(mainWorldScripts.length).toBeGreaterThan(0);
  });

  it("omits MAIN world injector when only dom-action tools", () => {
    const domOnlyProposals: ToolProposal[] = [
      {
        name: "clickBtn",
        description: "Click a button",
        inputSchema: { type: "object", properties: {} },
        actionType: "dom-action",
        actionDetails: { steps: [{ action: "click", selector: "#btn" }] },
      },
    ];

    const toolFiles = generateToolFiles(domOnlyProposals);
    const manifest = generateToolManifest(domOnlyProposals, {
      extensionName: "dom-only-ext",
    });

    generateExtension(manifest, toolFiles, domOnlyProposals, TEST_OUTPUT_DIR);

    const manifestJson = JSON.parse(
      readFileSync(join(TEST_OUTPUT_DIR, "manifest.json"), "utf-8"),
    );

    const mainWorldScripts = manifestJson.content_scripts.filter(
      (cs: Record<string, unknown>) => cs.world === "MAIN",
    );
    expect(mainWorldScripts).toHaveLength(0);
  });

  it("generates barrel file that imports all tools", () => {
    const toolFiles = generateToolFiles(sampleProposals);
    const manifest = generateToolManifest(sampleProposals, {
      extensionName: "test-extension",
    });

    generateExtension(manifest, toolFiles, sampleProposals, TEST_OUTPUT_DIR);

    const barrel = readFileSync(join(TEST_OUTPUT_DIR, "tools/index.ts"), "utf-8");
    expect(barrel).toContain('./getMenu.js');
    expect(barrel).toContain('./addToCart.js');
    expect(barrel).toContain("TOOL_NAMES");
  });

  it("generates extension package.json with correct deps", () => {
    const toolFiles = generateToolFiles(sampleProposals);
    const manifest = generateToolManifest(sampleProposals, {
      extensionName: "test-extension",
    });

    generateExtension(manifest, toolFiles, sampleProposals, TEST_OUTPUT_DIR);

    const pkg = JSON.parse(
      readFileSync(join(TEST_OUTPUT_DIR, "package.json"), "utf-8"),
    );
    expect(pkg.dependencies["webmcp-kit"]).toBeDefined();
    expect(pkg.devDependencies.vite).toBeDefined();
    expect(pkg.devDependencies.zod).toBeDefined();
    expect(pkg.scripts.build).toBeDefined();
  });
});
