/**
 * Structured prompt builder for tool proposals.
 *
 * Takes the combined DOM + JS analysis and produces a detailed prompt
 * that an AI coding agent can reason over to propose tool definitions.
 *
 * This module does NOT call an LLM — it returns the prompt string
 * for the orchestrating agent to process.
 */
import type {
  DOMAnalysis,
  JSAnalysis,
  SiteAnalysis,
  ToolProposal,
} from "./types.js";

/**
 * Build a structured prompt asking an AI agent to propose WebMCP tool definitions.
 *
 * @param analysis - The complete site analysis (DOM + JS + snapshots).
 * @returns A prompt string the agent can reason over.
 */
export function buildToolProposalPrompt(analysis: SiteAnalysis): string {
  const sections: string[] = [];

  // Header
  sections.push(`# WebMCP Tool Proposal Request

You are analyzing a website to propose WebMCP tool definitions that will let an AI agent interact with it.

**Target URL:** ${analysis.targetUrl}
**Scenario:** ${analysis.scenario ?? "General site interaction"}
**Pages analyzed:** ${analysis.snapshots.length}
**Analysis timestamp:** ${new Date(analysis.timestamp).toISOString()}
`);

  // DOM Analysis section
  sections.push(formatDOMSection(analysis.domAnalyses));

  // JS Analysis section
  sections.push(formatJSSection(analysis.jsAnalyses));

  // Instructions
  sections.push(formatInstructions());

  // Output format
  sections.push(formatOutputSchema());

  return sections.join("\n");
}

/**
 * Parse tool proposals from the agent's response.
 * Extracts JSON array from markdown code fences or raw JSON.
 */
export function parseToolProposals(agentResponse: string): ToolProposal[] {
  // Try extracting from code fences first
  const fenceMatch = agentResponse.match(
    /```(?:json)?\s*\n?([\s\S]*?)```/,
  );
  const jsonStr = fenceMatch ? fenceMatch[1]!.trim() : agentResponse.trim();

  try {
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) {
      return parsed as ToolProposal[];
    }
    if (parsed.tools && Array.isArray(parsed.tools)) {
      return parsed.tools as ToolProposal[];
    }
    throw new Error("Expected an array of tool proposals");
  } catch (e) {
    throw new Error(
      `Failed to parse tool proposals: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

// ─── Formatting Helpers ────────────────────────────────────────────────────────

function formatDOMSection(analyses: DOMAnalysis[]): string {
  if (analyses.length === 0) return "## DOM Analysis\n\nNo DOM analysis available.\n";

  const parts: string[] = ["## DOM Analysis\n"];

  for (const analysis of analyses) {
    parts.push(`### Page: ${analysis.url}`);
    parts.push(
      `Total interactive elements: ${analysis.totalInteractiveElements}\n`,
    );

    for (const region of analysis.regions) {
      parts.push(
        `#### Region: ${region.type}${region.label ? ` (${region.label})` : ""}`,
      );
      parts.push(`Selector: \`${region.selector}\``);
      parts.push(`Elements: ${region.interactiveElements.length}\n`);

      for (const el of region.interactiveElements) {
        const attrs = [
          el.tag,
          el.type ? `type="${el.type}"` : null,
          el.ariaLabel ? `aria-label="${el.ariaLabel}"` : null,
          el.text ? `text="${el.text.slice(0, 60)}"` : null,
          el.name ? `name="${el.name}"` : null,
          el.id ? `id="${el.id}"` : null,
          el.href ? `href="${el.href}"` : null,
          el.placeholder ? `placeholder="${el.placeholder}"` : null,
          el.actionHint ? `[${el.actionHint}]` : null,
        ]
          .filter(Boolean)
          .join(" ");

        parts.push(`- \`${el.selector}\` — ${attrs}`);

        if (el.options && el.options.length > 0) {
          parts.push(
            `  Options: ${el.options.map((o) => `${o.value}="${o.text}"`).join(", ")}`,
          );
        }
      }
      parts.push("");
    }
  }

  return parts.join("\n");
}

function formatJSSection(analyses: JSAnalysis[]): string {
  if (analyses.length === 0) return "## JS Surface\n\nNo JS analysis available.\n";

  const parts: string[] = ["## JS Surface\n"];

  for (const analysis of analyses) {
    parts.push(`### Page: ${analysis.url}\n`);

    // Globals
    if (analysis.globals.length > 0) {
      parts.push("#### Global Functions & Objects\n");
      for (const g of analysis.globals) {
        if (g.type === "function") {
          const params = g.params ? `(${g.params.join(", ")})` : "()";
          parts.push(`- \`${g.path}${params}\` — function`);
        } else if (g.type === "object" && g.methods) {
          parts.push(
            `- \`${g.path}\` — object with methods: ${g.methods.join(", ")}`,
          );
        }
      }
      parts.push("");
    }

    // Data layers
    if (analysis.dataLayers.length > 0) {
      parts.push("#### Data Layers\n");
      for (const dl of analysis.dataLayers) {
        parts.push(
          `- \`${dl.path}\` (${dl.framework}, ${dl.shape}) — keys: ${dl.keys.join(", ")}`,
        );
      }
      parts.push("");
    }

    // Event handlers
    if (analysis.eventHandlers.length > 0) {
      parts.push("#### Inline Event Handlers\n");
      for (const eh of analysis.eventHandlers) {
        parts.push(
          `- \`${eh.selector}\` on${eh.event}: \`${eh.handlerCode.slice(0, 80)}\`${eh.elementText ? ` ("${eh.elementText.slice(0, 40)}")` : ""}`,
        );
      }
      parts.push("");
    }

    // Exposed APIs
    if (analysis.exposedAPIs.length > 0) {
      parts.push("#### Exposed APIs\n");
      for (const api of analysis.exposedAPIs) {
        parts.push(`- \`${api.path}\`:`);
        for (const m of api.methods) {
          const params = m.params ? `(${m.params.join(", ")})` : "()";
          parts.push(`  - \`.${m.name}${params}\``);
        }
      }
      parts.push("");
    }
  }

  return parts.join("\n");
}

function formatInstructions(): string {
  return `## Instructions

Based on the DOM and JS analysis above, propose a set of WebMCP tool definitions that would allow an AI agent to interact with this website.

### Guidelines

1. **Prefer JS calls over DOM actions** — If a function like \`window.addToCart(id, qty)\` exists, create a tool that calls it directly rather than clicking buttons.

2. **Group related actions** — A form with name, email, and submit should be ONE tool (e.g., \`submitContactForm\`) that fills all fields and submits, not separate tools per field.

3. **Include read-only tools** — If there's data to read (cart contents, search results, menu items), create getter tools with \`readOnlyHint: true\`.

4. **Name tools descriptively** — Use camelCase names that describe the action: \`searchProducts\`, \`addToCart\`, \`getCartTotal\`, \`submitCheckout\`.

5. **Set annotations correctly:**
   - \`readOnlyHint: true\` — for tools that only read data (getMenu, getCart, searchResults)
   - \`destructiveHint: true\` — for tools that delete or irreversibly modify data (clearCart, deleteAccount)
   - \`confirmationHint: true\` — for tools that involve purchases, submissions, or significant actions (checkout, submitOrder)

6. **Define input schemas precisely** — Use appropriate types, add descriptions, set required fields, use enums where options are known.

7. **Action type selection:**
   - \`js-call\` — When a global function or API method is detected that performs the action directly
   - \`dom-action\` — When no JS API exists and the tool must interact with DOM elements (click, fill, select)

8. **URL patterns** — If tools only apply to certain pages, set \`urlPattern\` (e.g., \`"https://example.com/products/*"\`).
`;
}

function formatOutputSchema(): string {
  return `## Output Format

Respond with a JSON array of tool proposals. Each proposal should follow this schema:

\`\`\`json
[
  {
    "name": "toolName",
    "description": "What this tool does",
    "inputSchema": {
      "type": "object",
      "properties": {
        "paramName": {
          "type": "string",
          "description": "What this parameter is for"
        }
      },
      "required": ["paramName"]
    },
    "actionType": "js-call",
    "actionDetails": {
      "functionPath": "window.someFunction",
      "argMapping": ["paramName"],
      "returnType": "object"
    },
    "annotations": {
      "readOnlyHint": false,
      "destructiveHint": false,
      "confirmationHint": false
    },
    "urlPattern": "https://example.com/*"
  },
  {
    "name": "anotherTool",
    "description": "Another tool using DOM actions",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Search query"
        }
      },
      "required": ["query"]
    },
    "actionType": "dom-action",
    "actionDetails": {
      "steps": [
        {
          "action": "fill",
          "selector": "input[name='search']",
          "inputProperty": "query"
        },
        {
          "action": "click",
          "selector": "button[type='submit']"
        },
        {
          "action": "read",
          "selector": ".search-results",
          "readAttribute": "textContent",
          "delay": 1000
        }
      ]
    },
    "annotations": {
      "readOnlyHint": true
    }
  }
]
\`\`\`

Propose tools that cover the described scenario. Aim for 3-10 tools that give an agent comprehensive control over the key user flows on the site.
`;
}
