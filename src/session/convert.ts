/**
 * Convert session-recorded tools (ToolFromActions) into the standard
 * ToolProposal format used by the generate pipeline.
 */
import type { ToolFromActions } from "./types.js";
import type { ToolProposal, DOMAction, DOMActionStep } from "../analysis/types.js";

/**
 * Convert an array of tools discovered during an interactive session
 * into the ToolProposal format expected by generateToolFiles/generateExtension.
 */
export function convertSessionToolsToProposals(
  tools: ToolFromActions[],
): ToolProposal[] {
  return tools.map((tool) => {
    const domSteps: DOMActionStep[] = tool.steps
      .filter((s) => s.action !== "hover") // hover not supported in DOMActionStep
      .map((step) => ({
        action: step.action as DOMActionStep["action"],
        selector: step.selector,
        inputProperty: step.inputProperty,
        staticValue: step.staticValue,
        delay: step.delay,
      }));

    const domAction: DOMAction = { steps: domSteps };

    return {
      name: tool.name,
      description: `Tool discovered during interactive session`,
      inputSchema: {
        type: "object" as const,
        properties: Object.fromEntries(
          Object.entries(tool.inputSchema.properties).map(([key, val]) => [
            key,
            { type: val.type as any, description: val.description },
          ]),
        ),
        required: tool.inputSchema.required,
      },
      actionType: "dom-action" as const,
      actionDetails: domAction,
      urlPattern: tool.urlPatterns[0],
    };
  });
}
