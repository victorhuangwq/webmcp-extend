export const seeLocalDealsTool = {
  name: "seeLocalDeals",
  description: "View local deals available at the nearest store",
  inputSchema: {
    type: "object" as const,
    properties: {},
    required: [] as string[],
  },
  annotations: {
    readOnlyHint: true,
  },
  execute: async (_input: Record<string, unknown>) => {
    const el = document.querySelector("#tile-button-LocalDeals");
    if (!el) throw new Error("Element not found: #tile-button-LocalDeals");
    (el as HTMLElement).click();
    return "Navigated to local deals";
  },
};
