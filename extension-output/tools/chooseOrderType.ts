export const chooseOrderTypeTool = {
  name: "chooseOrderType",
  description: "Select delivery or carryout order type to begin an order",
  inputSchema: {
    type: "object" as const,
    properties: {
      orderType: {
        type: "string",
        description: "Whether to order for delivery or carryout",
        enum: ["delivery", "carryout"],
      },
    },
    required: ["orderType"],
  },
  annotations: {
    readOnlyHint: false,
  },
  execute: async (input: Record<string, unknown>) => {
    const orderType = input.orderType as string;
    const el = document.querySelector(`a[href='/?type=order_${orderType}']`);
    if (!el) throw new Error(`Element not found: a[href='/?type=order_${orderType}']`);
    (el as HTMLElement).click();
    return "Selected " + orderType;
  },
};
