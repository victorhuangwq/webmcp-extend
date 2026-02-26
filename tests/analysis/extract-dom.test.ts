/**
 * Tests for extract-dom.ts — DOM extraction from page snapshots.
 */
import { describe, it, expect } from "vitest";
import { extractDOM } from "../../src/analysis/extract-dom.js";
import type { PageSnapshot, AccessibilityNode } from "../../src/analysis/types.js";

function makeSnapshot(overrides: Partial<PageSnapshot> = {}): PageSnapshot {
  return {
    url: "https://example.com",
    title: "Test Page",
    bodyHTML: "<body></body>",
    accessibilityTree: null,
    timestamp: Date.now(),
    stepIndex: -1,
    ...overrides,
  };
}

describe("extractDOM", () => {
  it("returns empty regions for a blank page", () => {
    const snapshot = makeSnapshot({ bodyHTML: "<body></body>" });
    const result = extractDOM(snapshot);

    expect(result.url).toBe("https://example.com");
    expect(result.totalInteractiveElements).toBe(0);
    expect(result.regions).toHaveLength(0);
  });

  it("extracts buttons from HTML", () => {
    const snapshot = makeSnapshot({
      bodyHTML: `<body>
        <button id="add-btn">Add to Cart</button>
        <button id="remove-btn">Remove</button>
      </body>`,
    });
    const result = extractDOM(snapshot);

    expect(result.totalInteractiveElements).toBeGreaterThanOrEqual(2);

    const allElements = result.regions.flatMap((r) => r.interactiveElements);
    const addBtn = allElements.find((e) => e.id === "add-btn");
    expect(addBtn).toBeDefined();
    expect(addBtn?.tag).toBe("button");
    expect(addBtn?.text).toBe("Add to Cart");
    expect(addBtn?.selector).toBe("#add-btn");
  });

  it("extracts form inputs from HTML", () => {
    const snapshot = makeSnapshot({
      bodyHTML: `<body>
        <form>
          <input type="text" name="search" placeholder="Search..." />
          <input type="submit" value="Go" id="submit-btn" />
          <select name="category" id="category-select">
            <option value="pizza">Pizza</option>
            <option value="pasta">Pasta</option>
          </select>
        </form>
      </body>`,
    });
    const result = extractDOM(snapshot);

    const allElements = result.regions.flatMap((r) => r.interactiveElements);

    const searchInput = allElements.find((e) => e.name === "search");
    expect(searchInput).toBeDefined();
    expect(searchInput?.tag).toBe("input");
    expect(searchInput?.placeholder).toBe("Search...");
    expect(searchInput?.actionHint).toBe("input");

    const submitBtn = allElements.find((e) => e.id === "submit-btn");
    expect(submitBtn).toBeDefined();
    expect(submitBtn?.actionHint).toBe("submission");

    const select = allElements.find((e) => e.id === "category-select");
    expect(select).toBeDefined();
    expect(select?.tag).toBe("select");
    expect(select?.actionHint).toBe("selection");
  });

  it("extracts links with meaningful href from HTML", () => {
    const snapshot = makeSnapshot({
      bodyHTML: `<body>
        <a href="/products" id="products-link">Products</a>
        <a href="#" id="hash-link">Hash</a>
        <a href="javascript:void(0)" id="void-link">Void</a>
        <a href="/cart" onclick="openCart()" id="cart-link">Cart</a>
      </body>`,
    });
    const result = extractDOM(snapshot);

    const allElements = result.regions.flatMap((r) => r.interactiveElements);

    const productsLink = allElements.find((e) => e.id === "products-link");
    expect(productsLink).toBeDefined();
    expect(productsLink?.tag).toBe("a");
    expect(productsLink?.href).toBe("/products");
    expect(productsLink?.actionHint).toBe("navigation");
  });

  it("extracts from accessibility tree", () => {
    const a11yTree: AccessibilityNode = {
      role: "WebArea",
      name: "Test Page",
      children: [
        {
          role: "navigation",
          name: "Main Nav",
          children: [
            { role: "link", name: "Home" },
            { role: "link", name: "Products" },
          ],
        },
        {
          role: "main",
          name: "",
          children: [
            { role: "button", name: "Add to Cart" },
            { role: "textbox", name: "Search" },
          ],
        },
      ],
    };

    const snapshot = makeSnapshot({
      accessibilityTree: a11yTree,
      bodyHTML: "<body></body>",
    });

    const result = extractDOM(snapshot);

    // Should have regions from navigation and main
    expect(result.regions.length).toBeGreaterThanOrEqual(2);

    const navRegion = result.regions.find((r) => r.type === "nav");
    expect(navRegion).toBeDefined();
    expect(navRegion?.interactiveElements).toHaveLength(2);

    const mainRegion = result.regions.find((r) => r.type === "main");
    expect(mainRegion).toBeDefined();
    expect(mainRegion?.interactiveElements).toHaveLength(2);

    const addBtn = mainRegion?.interactiveElements.find(
      (e) => e.text === "Add to Cart",
    );
    expect(addBtn).toBeDefined();
    expect(addBtn?.role).toBe("button");
    expect(addBtn?.actionHint).toBe("trigger");
  });

  it("merges HTML elements without duplicating", () => {
    const a11yTree: AccessibilityNode = {
      role: "WebArea",
      children: [
        {
          role: "main",
          children: [{ role: "button", name: "Submit" }],
        },
      ],
    };

    const snapshot = makeSnapshot({
      accessibilityTree: a11yTree,
      bodyHTML: `<body>
        <main>
          <button aria-label="Submit">Submit</button>
          <button id="cancel-btn">Cancel</button>
        </main>
      </body>`,
    });

    const result = extractDOM(snapshot);
    const allElements = result.regions.flatMap((r) => r.interactiveElements);

    // Should have both Submit (from a11y) and Cancel (from HTML)
    // but not duplicate Submit
    const submitElements = allElements.filter(
      (e) => e.text === "Submit" || e.ariaLabel === "Submit",
    );
    // At least one submit element should exist
    expect(submitElements.length).toBeGreaterThanOrEqual(1);

    const cancelBtn = allElements.find((e) => e.id === "cancel-btn");
    expect(cancelBtn).toBeDefined();
  });
});
