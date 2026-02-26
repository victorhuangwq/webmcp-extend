/**
 * Tool manifest generator — maps URL patterns to tool file paths.
 */
import type { ToolManifest, ToolProposal } from "../analysis/types.js";

export interface ManifestOptions {
  /** Extension name (default: derived from target URL). */
  extensionName?: string;
  /** Extension version (default: "0.1.0"). */
  version?: string;
  /** Default URL pattern if proposals don't specify one. */
  defaultPattern?: string;
}

/**
 * Generate a tool manifest mapping URL patterns to tool files.
 *
 * @param proposals - Tool proposals (each may have a urlPattern).
 * @param options - Manifest configuration.
 * @returns A ToolManifest object.
 */
export function generateToolManifest(
  proposals: ToolProposal[],
  options: ManifestOptions = {},
): ToolManifest {
  const {
    extensionName = "webmcp-extend-tools",
    version = "0.1.0",
    defaultPattern = "<all_urls>",
  } = options;

  const patterns: Record<string, string[]> = {};
  const toolNames: string[] = [];

  for (const proposal of proposals) {
    const pattern = proposal.urlPattern ?? defaultPattern;
    const toolPath = `tools/${proposal.name}.ts`;

    if (!patterns[pattern]) {
      patterns[pattern] = [];
    }
    patterns[pattern].push(toolPath);
    toolNames.push(proposal.name);
  }

  return {
    patterns,
    toolNames,
    extensionName,
    version,
  };
}

/**
 * Convert a URL pattern from glob style to Chrome extension match pattern.
 *
 * Examples:
 *   "https://example.com/*" → "https://example.com/*"
 *   "https://example.com/products/*" → "https://example.com/products/*"
 *   "example.com" → "*://example.com/*"
 */
export function toMatchPattern(urlPattern: string): string {
  // Already a valid match pattern
  if (/^(https?|\*):\/\//.test(urlPattern)) {
    return urlPattern;
  }

  // <all_urls> is a special case
  if (urlPattern === "<all_urls>") {
    return urlPattern;
  }

  // Bare domain — wrap with scheme and path
  if (!urlPattern.includes("://")) {
    return `*://${urlPattern}/*`;
  }

  return urlPattern;
}
