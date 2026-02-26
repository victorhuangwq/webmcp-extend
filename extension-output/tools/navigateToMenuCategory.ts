export const navigateToMenuCategoryTool = {
  name: "navigateToMenuCategory",
  description: "Navigate to a specific menu category page to browse items (e.g., build-your-own, specialty, bread, tots, wings, dessert, pasta, sandwich, g-salad, drinks, sides)",
  inputSchema: {
    type: "object" as const,
    properties: {
      category: {
        type: "string",
        description: "Menu category slug",
        enum: ["build-your-own", "specialty", "bread", "tots", "wings", "dessert", "pasta", "sandwich", "g-salad", "drinks", "sides"],
      },
    },
    required: ["category"],
  },
  annotations: {
    readOnlyHint: false,
  },
  execute: async (input: Record<string, unknown>) => {
    const category = input.category as string;
    const el = document.querySelector(`a[href='/menu/${category}']`);
    if (!el) throw new Error(`Element not found: a[href='/menu/${category}']`);
    (el as HTMLElement).click();
    return "Navigated to " + category;
  },
};
