/**
 * Tests for extract-js.ts — JS surface detection.
 *
 * These tests use a mock EvaluatablePage to avoid needing Playwright.
 */
import { describe, it, expect } from "vitest";
import { extractJS, type EvaluatablePage } from "../../src/analysis/extract-js.js";

/**
 * Create a mock page that returns predefined results from evaluate().
 */
function createMockPage(
  evaluateResults: unknown[],
  pageUrl = "https://example.com",
): EvaluatablePage {
  let callIndex = 0;
  return {
    evaluate: async () => {
      const result = evaluateResults[callIndex] ?? [];
      callIndex++;
      return result;
    },
    url: () => pageUrl,
  };
}

describe("extractJS", () => {
  it("returns structured JSAnalysis with all sections", async () => {
    const page = createMockPage([
      // globals
      [{ path: "window.myFunc", type: "function", params: ["a", "b"] }],
      // dataLayers
      [{ path: "window.__NEXT_DATA__", framework: "next", keys: ["props"], shape: "object" }],
      // eventHandlers
      [{ selector: "#btn", event: "click", handlerCode: "doSomething()" }],
      // exposedAPIs
      [{ path: "window.api", methods: [{ name: "search", params: ["query"] }] }],
    ]);

    const result = await extractJS(page);

    expect(result.url).toBe("https://example.com");
    expect(result.globals).toHaveLength(1);
    expect(result.globals[0]?.path).toBe("window.myFunc");
    expect(result.globals[0]?.params).toEqual(["a", "b"]);

    expect(result.dataLayers).toHaveLength(1);
    expect(result.dataLayers[0]?.framework).toBe("next");

    expect(result.eventHandlers).toHaveLength(1);
    expect(result.eventHandlers[0]?.event).toBe("click");

    expect(result.exposedAPIs).toHaveLength(1);
    expect(result.exposedAPIs[0]?.methods).toHaveLength(1);
  });

  it("handles empty results gracefully", async () => {
    const page = createMockPage([[], [], [], []]);

    const result = await extractJS(page);

    expect(result.globals).toHaveLength(0);
    expect(result.dataLayers).toHaveLength(0);
    expect(result.eventHandlers).toHaveLength(0);
    expect(result.exposedAPIs).toHaveLength(0);
  });

  it("uses the correct URL from the page", async () => {
    const page = createMockPage([[], [], [], []], "https://test.example.com/products");

    const result = await extractJS(page);
    expect(result.url).toBe("https://test.example.com/products");
  });
});
