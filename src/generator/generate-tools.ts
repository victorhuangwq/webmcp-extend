/**
 * Tool code generator — emits defineTool() TypeScript source files
 * from tool proposals.
 */
import type {
  DOMAction,
  DOMActionStep,
  GeneratedFile,
  JSCallAction,
  ToolInputProperty,
  ToolInputSchema,
  ToolProposal,
} from "../analysis/types.js";

/**
 * Generate TypeScript tool definition files from proposals.
 *
 * Each proposal becomes a separate .ts file that imports from webmcp-kit
 * and defines a tool using defineTool().
 *
 * @param proposals - Array of tool proposals from the analysis/agent step.
 * @returns Array of generated files with relative paths and content.
 */
export function generateToolFiles(proposals: ToolProposal[]): GeneratedFile[] {
  return proposals.map((proposal) => ({
    path: `tools/${proposal.name}.ts`,
    content: generateToolFile(proposal),
  }));
}

/**
 * Generate a single tool definition file.
 */
function generateToolFile(proposal: ToolProposal): string {
  const lines: string[] = [];

  // Imports
  lines.push(`import { defineTool, textContent, jsonContent } from "webmcp-kit";`);
  lines.push(`import { z } from "zod";`);
  lines.push("");

  // Schema
  lines.push(`const inputSchema = ${generateZodSchema(proposal.inputSchema)};`);
  lines.push("");

  // Tool definition
  lines.push(`export const ${proposal.name}Tool = defineTool({`);
  lines.push(`  name: "${proposal.name}",`);
  lines.push(`  description: ${JSON.stringify(proposal.description)},`);
  lines.push(`  inputSchema,`);

  // Annotations
  if (proposal.annotations) {
    const annotationEntries: string[] = [];
    if (proposal.annotations.readOnlyHint !== undefined) {
      annotationEntries.push(`    readOnlyHint: ${proposal.annotations.readOnlyHint}`);
    }
    if (proposal.annotations.destructiveHint !== undefined) {
      annotationEntries.push(`    destructiveHint: ${proposal.annotations.destructiveHint}`);
    }
    if (proposal.annotations.confirmationHint !== undefined) {
      annotationEntries.push(`    confirmationHint: ${proposal.annotations.confirmationHint}`);
    }
    if (annotationEntries.length > 0) {
      lines.push(`  annotations: {`);
      lines.push(annotationEntries.join(",\n"));
      lines.push(`  },`);
    }
  }

  // Execute function
  lines.push(`  execute: async (input) => {`);

  if (proposal.actionType === "js-call") {
    lines.push(generateJSCallBody(proposal.actionDetails as JSCallAction));
  } else {
    lines.push(generateDOMActionBody(proposal.actionDetails as DOMAction));
  }

  lines.push(`  },`);
  lines.push(`});`);
  lines.push("");

  // Auto-register
  lines.push(`// Register the tool when this module is loaded`);
  lines.push(`${proposal.name}Tool.register();`);
  lines.push("");

  return lines.join("\n");
}

// ─── Zod Schema Generation ────────────────────────────────────────────────────

/**
 * Generate a Zod schema expression from a ToolInputSchema.
 */
function generateZodSchema(schema: ToolInputSchema): string {
  const properties = Object.entries(schema.properties);
  if (properties.length === 0) {
    return "z.object({})";
  }

  const required = new Set(schema.required ?? []);
  const props = properties.map(([name, prop]) => {
    let zodType = generateZodType(prop);
    if (!required.has(name)) {
      zodType += ".optional()";
    }
    if (prop.description) {
      zodType += `.describe(${JSON.stringify(prop.description)})`;
    }
    return `  ${name}: ${zodType}`;
  });

  return `z.object({\n${props.join(",\n")},\n})`;
}

/**
 * Generate a Zod type expression from a ToolInputProperty.
 */
function generateZodType(prop: ToolInputProperty): string {
  switch (prop.type) {
    case "string":
      if (prop.enum) {
        return `z.enum([${prop.enum.map((e) => JSON.stringify(e)).join(", ")}])`;
      }
      return "z.string()";

    case "number": {
      let expr = "z.number()";
      if (prop.minimum !== undefined) expr += `.min(${prop.minimum})`;
      if (prop.maximum !== undefined) expr += `.max(${prop.maximum})`;
      return expr;
    }

    case "boolean":
      return "z.boolean()";

    case "array":
      if (prop.items) {
        return `z.array(${generateZodType(prop.items)})`;
      }
      return "z.array(z.unknown())";

    case "object":
      return "z.record(z.unknown())";

    default:
      return "z.unknown()";
  }
}

// ─── JS Call Body Generation ───────────────────────────────────────────────────

/**
 * Generate the execute() body for a JS-call tool.
 */
function generateJSCallBody(action: JSCallAction): string {
  const lines: string[] = [];
  const args = action.argMapping.map((a) => `input.${a}`).join(", ");

  lines.push(`    try {`);
  lines.push(`      // Call the page's JS function directly`);
  lines.push(`      const fn = ${action.functionPath};`);
  lines.push(`      if (typeof fn !== "function") {`);
  lines.push(`        return textContent("Error: ${action.functionPath} is not available on this page");`);
  lines.push(`      }`);

  if (action.returnType === "void") {
    lines.push(`      fn(${args});`);
    lines.push(`      return textContent("Action completed successfully");`);
  } else {
    lines.push(`      const result = fn(${args});`);
    lines.push(`      return jsonContent(result);`);
  }

  lines.push(`    } catch (error) {`);
  lines.push(`      return textContent(\`Error calling ${action.functionPath}: \${error}\`);`);
  lines.push(`    }`);

  return lines.join("\n");
}

// ─── DOM Action Body Generation ────────────────────────────────────────────────

/**
 * Generate the execute() body for a DOM-action tool.
 */
function generateDOMActionBody(action: DOMAction): string {
  const lines: string[] = [];

  lines.push(`    try {`);

  for (let i = 0; i < action.steps.length; i++) {
    const step = action.steps[i]!;
    lines.push(`      // Step ${i + 1}: ${step.description ?? step.action}`);
    lines.push(generateDOMStep(step, i));

    if (step.delay) {
      lines.push(
        `      await new Promise(resolve => setTimeout(resolve, ${step.delay}));`,
      );
    }
  }

  // Check if the last step is a read — if so, return its result
  const lastStep = action.steps[action.steps.length - 1];
  if (lastStep?.action === "read") {
    lines.push(`      return textContent(result_${action.steps.length - 1} ?? "No content found");`);
  } else {
    lines.push(`      return textContent("Action completed successfully");`);
  }

  lines.push(`    } catch (error) {`);
  lines.push(`      return textContent(\`Error: \${error}\`);`);
  lines.push(`    }`);

  return lines.join("\n");
}

/**
 * Generate code for a single DOM action step.
 */
function generateDOMStep(step: DOMActionStep, index: number): string {
  const elVar = `el_${index}`;
  const lines: string[] = [];

  if (step.action === "read") {
    const attr = step.readAttribute ?? "textContent";
    lines.push(
      `      const ${elVar} = document.querySelector(${JSON.stringify(step.selector)});`,
    );
    if (attr === "textContent" || attr === "innerHTML" || attr === "outerHTML") {
      lines.push(`      const result_${index} = ${elVar}?.${attr};`);
    } else if (attr === "value") {
      lines.push(
        `      const result_${index} = (${elVar} as HTMLInputElement)?.value;`,
      );
    } else {
      lines.push(
        `      const result_${index} = ${elVar}?.getAttribute(${JSON.stringify(attr)});`,
      );
    }
    return lines.join("\n");
  }

  lines.push(
    `      const ${elVar} = document.querySelector(${JSON.stringify(step.selector)});`,
  );
  lines.push(`      if (!${elVar}) throw new Error("Element not found: ${step.selector}");`);

  switch (step.action) {
    case "click":
      lines.push(`      (${elVar} as HTMLElement).click();`);
      break;

    case "fill": {
      const value = step.inputProperty
        ? `input.${step.inputProperty}`
        : JSON.stringify(step.staticValue ?? "");
      lines.push(`      (${elVar} as HTMLInputElement).value = ${value};`);
      lines.push(
        `      ${elVar}.dispatchEvent(new Event("input", { bubbles: true }));`,
      );
      lines.push(
        `      ${elVar}.dispatchEvent(new Event("change", { bubbles: true }));`,
      );
      break;
    }

    case "select": {
      const value = step.inputProperty
        ? `input.${step.inputProperty}`
        : JSON.stringify(step.staticValue ?? "");
      lines.push(`      (${elVar} as HTMLSelectElement).value = ${value};`);
      lines.push(
        `      ${elVar}.dispatchEvent(new Event("change", { bubbles: true }));`,
      );
      break;
    }

    case "check":
      lines.push(`      (${elVar} as HTMLInputElement).checked = true;`);
      lines.push(
        `      ${elVar}.dispatchEvent(new Event("change", { bubbles: true }));`,
      );
      break;

    case "submit":
      lines.push(`      (${elVar} as HTMLFormElement).submit();`);
      break;

    case "scroll":
      lines.push(`      ${elVar}.scrollIntoView({ behavior: "smooth" });`);
      break;
  }

  return lines.join("\n");
}
