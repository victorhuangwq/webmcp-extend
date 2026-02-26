export const viewCartTool = {
  name: "viewCart",
  description: "Open the shopping cart to view current items",
  inputSchema: {
    type: "object" as const,
    properties: {},
    required: [] as string[],
  },
  annotations: {
    readOnlyHint: true,
  },
  execute: async (_input: Record<string, unknown>) => {
    const btn = document.querySelector("button[aria-label^='View cart']");
    if (!btn) throw new Error("Element not found: button[aria-label^='View cart']");
    (btn as HTMLElement).click();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const panel = document.querySelector("[role='dialog'], .cart-panel, .cart-content, main");
    return panel?.textContent?.trim() ?? "No content found";
  },
};
