export const startOrderTool = {
  name: "startOrder",
  description: "Click the 'Order Now' button to begin the ordering flow",
  inputSchema: {
    type: "object" as const,
    properties: {},
    required: [] as string[],
  },
  annotations: {
    readOnlyHint: false,
  },
  execute: async (_input: Record<string, unknown>) => {
    const el = document.querySelector("button[name='Blue Nav - Order Now']");
    if (!el) throw new Error("Element not found: button[name='Blue Nav - Order Now']");
    (el as HTMLElement).click();
    return "Order started";
  },
};
