export const addDealTool = {
  name: "addDeal",
  description: "Add a promotional deal to the cart (e.g., MixAndMatch, BestDealEver, WeekLongCarryout, PerfectCombo)",
  inputSchema: {
    type: "object" as const,
    properties: {
      dealId: {
        type: "string",
        description: "The deal identifier",
        enum: ["MixAndMatch", "BestDealEver", "WeekLongCarryout", "PerfectCombo"],
      },
    },
    required: ["dealId"],
  },
  annotations: {
    readOnlyHint: false,
  },
  execute: async (input: Record<string, unknown>) => {
    const dealId = input.dealId as string;
    const el = document.querySelector(`#tile-button-${dealId}`);
    if (!el) throw new Error(`Element not found: #tile-button-${dealId}`);
    (el as HTMLElement).click();
    return "Deal added: " + dealId;
  },
};
