/**
 * Tests for generate-tools.ts — tool TypeScript code generation.
 */
import { describe, it, expect } from "vitest";
import { generateToolFiles } from "../../src/generator/generate-tools.js";
import type { ToolProposal } from "../../src/analysis/types.js";

const jsCallProposal: ToolProposal = {
  name: "getMenu",
  description: "Get the pizza menu with all available items",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
  actionType: "js-call",
  actionDetails: {
    functionPath: "window.getMenu",
    argMapping: [],
    returnType: "object",
  },
  annotations: {
    readOnlyHint: true,
  },
};

const domActionProposal: ToolProposal = {
  name: "addToCart",
  description: "Add a pizza to the shopping cart",
  inputSchema: {
    type: "object",
    properties: {
      pizzaId: { type: "string", description: "The pizza ID from the menu" },
      quantity: {
        type: "number",
        description: "Number of pizzas to add",
        minimum: 1,
        maximum: 10,
      },
      size: {
        type: "string",
        description: "Pizza size",
        enum: ["small", "medium", "large"],
      },
    },
    required: ["pizzaId", "quantity"],
  },
  actionType: "dom-action",
  actionDetails: {
    steps: [
      {
        action: "fill",
        selector: "#pizza-id-input",
        inputProperty: "pizzaId",
        description: "Enter pizza ID",
      },
      {
        action: "fill",
        selector: "#quantity-input",
        inputProperty: "quantity",
        description: "Enter quantity",
      },
      {
        action: "select",
        selector: "#size-select",
        inputProperty: "size",
        description: "Select size",
      },
      {
        action: "click",
        selector: "#add-to-cart-btn",
        description: "Click add to cart",
      },
    ],
  },
  annotations: {
    readOnlyHint: false,
  },
};

const destructiveProposal: ToolProposal = {
  name: "clearCart",
  description: "Remove all items from the cart",
  inputSchema: { type: "object", properties: {} },
  actionType: "js-call",
  actionDetails: {
    functionPath: "window.cart.clear",
    argMapping: [],
    returnType: "void",
  },
  annotations: {
    destructiveHint: true,
  },
};

describe("generateToolFiles", () => {
  it("generates one file per proposal", () => {
    const files = generateToolFiles([jsCallProposal, domActionProposal]);

    expect(files).toHaveLength(2);
    expect(files[0]?.path).toBe("tools/getMenu.ts");
    expect(files[1]?.path).toBe("tools/addToCart.ts");
  });

  it("generates valid TypeScript with webmcp-kit imports", () => {
    const files = generateToolFiles([jsCallProposal]);
    const content = files[0]!.content;

    expect(content).toContain('import { defineTool, textContent, jsonContent } from "webmcp-kit"');
    expect(content).toContain('import { z } from "zod"');
  });

  it("generates proper Zod schema for js-call tool", () => {
    const files = generateToolFiles([jsCallProposal]);
    const content = files[0]!.content;

    expect(content).toContain("z.object({})");
    expect(content).toContain('name: "getMenu"');
    expect(content).toContain("readOnlyHint: true");
  });

  it("generates Zod schema with types, enums, and constraints", () => {
    const files = generateToolFiles([domActionProposal]);
    const content = files[0]!.content;

    expect(content).toContain("z.string()");
    expect(content).toContain("z.number()");
    expect(content).toContain(".min(1)");
    expect(content).toContain(".max(10)");
    expect(content).toContain('z.enum(["small", "medium", "large"])');
    expect(content).toContain(".optional()");
    expect(content).toContain('.describe("Pizza size")');
  });

  it("generates js-call execute body", () => {
    const files = generateToolFiles([jsCallProposal]);
    const content = files[0]!.content;

    expect(content).toContain("window.getMenu");
    expect(content).toContain("jsonContent(result)");
  });

  it("generates dom-action execute body with steps", () => {
    const files = generateToolFiles([domActionProposal]);
    const content = files[0]!.content;

    expect(content).toContain('document.querySelector("#pizza-id-input")');
    expect(content).toContain("input.pizzaId");
    expect(content).toContain('document.querySelector("#quantity-input")');
    expect(content).toContain('document.querySelector("#size-select")');
    expect(content).toContain('document.querySelector("#add-to-cart-btn")');
    expect(content).toContain("(el_3 as HTMLElement).click()");
  });

  it("generates annotations correctly", () => {
    const files = generateToolFiles([destructiveProposal]);
    const content = files[0]!.content;

    expect(content).toContain("destructiveHint: true");
  });

  it("generates void return for void functions", () => {
    const files = generateToolFiles([destructiveProposal]);
    const content = files[0]!.content;

    expect(content).toContain('textContent("Action completed successfully")');
  });

  it("includes auto-register call", () => {
    const files = generateToolFiles([jsCallProposal]);
    const content = files[0]!.content;

    expect(content).toContain("getMenuTool.register()");
  });

  it("generates confirmation hint for checkout-like tools", () => {
    const checkoutProposal: ToolProposal = {
      name: "checkout",
      description: "Complete the purchase",
      inputSchema: { type: "object", properties: {} },
      actionType: "dom-action",
      actionDetails: {
        steps: [{ action: "click", selector: "#checkout-btn" }],
      },
      annotations: {
        confirmationHint: true,
      },
    };

    const files = generateToolFiles([checkoutProposal]);
    const content = files[0]!.content;

    expect(content).toContain("confirmationHint: true");
  });
});
