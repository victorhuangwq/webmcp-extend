/**
 * Tests for generate-manifest.ts — URL pattern → tool mapping.
 */
import { describe, it, expect } from "vitest";
import {
  generateToolManifest,
  toMatchPattern,
} from "../../src/generator/generate-manifest.js";
import type { ToolProposal } from "../../src/analysis/types.js";

describe("generateToolManifest", () => {
  it("creates manifest from proposals with URL patterns", () => {
    const proposals: ToolProposal[] = [
      {
        name: "getMenu",
        description: "Get menu",
        inputSchema: { type: "object", properties: {} },
        actionType: "js-call",
        actionDetails: { functionPath: "window.getMenu", argMapping: [] },
        urlPattern: "https://pizza.example.com/*",
      },
      {
        name: "addToCart",
        description: "Add to cart",
        inputSchema: { type: "object", properties: {} },
        actionType: "dom-action",
        actionDetails: { steps: [] },
        urlPattern: "https://pizza.example.com/*",
      },
      {
        name: "searchProducts",
        description: "Search",
        inputSchema: { type: "object", properties: {} },
        actionType: "dom-action",
        actionDetails: { steps: [] },
        urlPattern: "https://pizza.example.com/products/*",
      },
    ];

    const manifest = generateToolManifest(proposals, {
      extensionName: "pizza-tools",
    });

    expect(manifest.extensionName).toBe("pizza-tools");
    expect(manifest.toolNames).toEqual(["getMenu", "addToCart", "searchProducts"]);
    expect(Object.keys(manifest.patterns)).toHaveLength(2);
    expect(manifest.patterns["https://pizza.example.com/*"]).toHaveLength(2);
    expect(manifest.patterns["https://pizza.example.com/products/*"]).toHaveLength(1);
  });

  it("uses default pattern when proposals don't specify one", () => {
    const proposals: ToolProposal[] = [
      {
        name: "search",
        description: "Search",
        inputSchema: { type: "object", properties: {} },
        actionType: "dom-action",
        actionDetails: { steps: [] },
      },
    ];

    const manifest = generateToolManifest(proposals, {
      defaultPattern: "https://example.com/*",
    });

    expect(manifest.patterns["https://example.com/*"]).toContain("tools/search.ts");
  });

  it("uses <all_urls> as default when no pattern specified", () => {
    const proposals: ToolProposal[] = [
      {
        name: "test",
        description: "Test",
        inputSchema: { type: "object", properties: {} },
        actionType: "dom-action",
        actionDetails: { steps: [] },
      },
    ];

    const manifest = generateToolManifest(proposals);
    expect(manifest.patterns["<all_urls>"]).toBeDefined();
  });

  it("generates correct tool file paths", () => {
    const proposals: ToolProposal[] = [
      {
        name: "myTool",
        description: "A tool",
        inputSchema: { type: "object", properties: {} },
        actionType: "js-call",
        actionDetails: { functionPath: "window.fn", argMapping: [] },
      },
    ];

    const manifest = generateToolManifest(proposals);
    const files = Object.values(manifest.patterns).flat();
    expect(files).toContain("tools/myTool.ts");
  });
});

describe("toMatchPattern", () => {
  it("passes through valid match patterns", () => {
    expect(toMatchPattern("https://example.com/*")).toBe("https://example.com/*");
    expect(toMatchPattern("*://example.com/*")).toBe("*://example.com/*");
    expect(toMatchPattern("http://localhost:3000/*")).toBe("http://localhost:3000/*");
  });

  it("passes through <all_urls>", () => {
    expect(toMatchPattern("<all_urls>")).toBe("<all_urls>");
  });

  it("wraps bare domains with scheme and path", () => {
    expect(toMatchPattern("example.com")).toBe("*://example.com/*");
    expect(toMatchPattern("pizza.example.com")).toBe("*://pizza.example.com/*");
  });
});
