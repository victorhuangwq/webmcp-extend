export const getMenuCategoriesTool = {
  name: "getMenuCategories",
  description: "Get the list of available menu categories (e.g., Build Your Own, Specialty Pizzas, Breads, Chicken, Desserts, Pastas, Sandwiches, Salads, Drinks, Extras)",
  inputSchema: {
    type: "object" as const,
    properties: {},
    required: [] as string[],
  },
  annotations: {
    readOnlyHint: true,
  },
  execute: async (_input: Record<string, unknown>) => {
    const elements = document.querySelectorAll("a[href^='/menu/']");
    const categories = Array.from(elements).map((el) => el.textContent?.trim()).filter(Boolean);
    return categories.length > 0 ? categories.join(", ") : "No categories found";
  },
};
