/**
 * Tests for propose-tools.ts — prompt builder and proposal parser.
 */
import { describe, it, expect } from "vitest";
import {
  buildToolProposalPrompt,
  parseToolProposals,
} from "../../src/analysis/propose-tools.js";
import type { SiteAnalysis, ToolProposal } from "../../src/analysis/types.js";

function makeSiteAnalysis(overrides: Partial<SiteAnalysis> = {}): SiteAnalysis {
  return {
    targetUrl: "https://example.com",
    scenario: "User browses products and adds to cart",
    snapshots: [
      {
        url: "https://example.com",
        title: "Example Shop",
        bodyHTML: "<body>...</body>",
        accessibilityTree: null,
        timestamp: Date.now(),
        stepIndex: -1,
      },
    ],
    domAnalyses: [
      {
        url: "https://example.com",
        regions: [
          {
            type: "main",
            selector: "main",
            interactiveElements: [
              {
                tag: "button",
                selector: "#add-btn",
                text: "Add to Cart",
                actionHint: "trigger",
              },
              {
                tag: "input",
                type: "text",
                selector: "input[name='search']",
                name: "search",
                placeholder: "Search products...",
                actionHint: "input",
              },
            ],
          },
        ],
        totalInteractiveElements: 2,
      },
    ],
    jsAnalyses: [
      {
        url: "https://example.com",
        globals: [
          {
            path: "window.addToCart",
            type: "function",
            params: ["productId", "quantity"],
          },
          {
            path: "window.cart",
            type: "object",
            methods: ["getItems", "clear", "getTotal"],
          },
        ],
        dataLayers: [],
        eventHandlers: [
          {
            selector: "#add-btn",
            event: "click",
            handlerCode: "addToCart(this.dataset.productId, 1)",
            elementText: "Add to Cart",
          },
        ],
        exposedAPIs: [],
      },
    ],
    proposalPrompt: "",
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("buildToolProposalPrompt", () => {
  it("generates a structured prompt", () => {
    const analysis = makeSiteAnalysis();
    const prompt = buildToolProposalPrompt(analysis);

    // Header
    expect(prompt).toContain("WebMCP Tool Proposal Request");
    expect(prompt).toContain("https://example.com");
    expect(prompt).toContain("browses products and adds to cart");

    // DOM section
    expect(prompt).toContain("## DOM Analysis");
    expect(prompt).toContain("#add-btn");
    expect(prompt).toContain("Add to Cart");
    expect(prompt).toContain("input[name='search']");

    // JS section
    expect(prompt).toContain("## JS Surface");
    expect(prompt).toContain("window.addToCart");
    expect(prompt).toContain("productId, quantity");
    expect(prompt).toContain("window.cart");
    expect(prompt).toContain("getItems, clear, getTotal");

    // Instructions
    expect(prompt).toContain("## Instructions");
    expect(prompt).toContain("Prefer JS calls over DOM actions");
    expect(prompt).toContain("readOnlyHint");
    expect(prompt).toContain("destructiveHint");
    expect(prompt).toContain("confirmationHint");

    // Output format
    expect(prompt).toContain("## Output Format");
    expect(prompt).toContain("JSON array of tool proposals");
  });

  it("handles empty analysis gracefully", () => {
    const analysis = makeSiteAnalysis({
      domAnalyses: [],
      jsAnalyses: [],
    });
    const prompt = buildToolProposalPrompt(analysis);

    expect(prompt).toContain("No DOM analysis available");
    expect(prompt).toContain("No JS analysis available");
  });

  it("includes data layer info when present", () => {
    const analysis = makeSiteAnalysis({
      jsAnalyses: [
        {
          url: "https://example.com",
          globals: [],
          dataLayers: [
            {
              path: "window.__NEXT_DATA__",
              framework: "next",
              keys: ["props", "page", "query"],
              shape: "object",
            },
          ],
          eventHandlers: [],
          exposedAPIs: [],
        },
      ],
    });
    const prompt = buildToolProposalPrompt(analysis);

    expect(prompt).toContain("Data Layers");
    expect(prompt).toContain("window.__NEXT_DATA__");
    expect(prompt).toContain("next");
  });
});

describe("parseToolProposals", () => {
  it("parses a JSON array of proposals", () => {
    const jsonStr = JSON.stringify([
      {
        name: "getMenu",
        description: "Get the menu",
        inputSchema: { type: "object", properties: {} },
        actionType: "js-call",
        actionDetails: {
          functionPath: "window.getMenu",
          argMapping: [],
        },
      },
    ]);

    const proposals = parseToolProposals(jsonStr);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.name).toBe("getMenu");
  });

  it("extracts proposals from markdown code fences", () => {
    const markdown = `Here are the proposed tools:

\`\`\`json
[
  {
    "name": "addToCart",
    "description": "Add item to cart",
    "inputSchema": { "type": "object", "properties": { "id": { "type": "string", "description": "Product ID" } } },
    "actionType": "js-call",
    "actionDetails": { "functionPath": "window.addToCart", "argMapping": ["id"] }
  }
]
\`\`\`

These tools cover the main user flow.`;

    const proposals = parseToolProposals(markdown);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.name).toBe("addToCart");
  });

  it("handles { tools: [...] } wrapper", () => {
    const jsonStr = JSON.stringify({
      tools: [
        {
          name: "search",
          description: "Search products",
          inputSchema: { type: "object", properties: {} },
          actionType: "dom-action",
          actionDetails: { steps: [] },
        },
      ],
    });

    const proposals = parseToolProposals(jsonStr);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.name).toBe("search");
  });

  it("throws on invalid JSON", () => {
    expect(() => parseToolProposals("not json")).toThrow(
      "Failed to parse tool proposals",
    );
  });

  it("throws on non-array response", () => {
    expect(() => parseToolProposals('{"name": "foo"}')).toThrow(
      "Expected an array",
    );
  });
});
