export const getPageContentTool = {
  name: "getPageContent",
  description: "Read the main content of the current page, useful for reading menu items, pizza options, and prices after navigating to a menu category",
  inputSchema: {
    type: "object" as const,
    properties: {},
    required: [] as string[],
  },
  annotations: {
    readOnlyHint: true,
  },
  execute: async (_input: Record<string, unknown>) => {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const el = document.querySelector("main, #content, [role='main'], .page-content, body");
    return el?.textContent?.trim() ?? "No content found";
  },
};
