/**
 * DOM extraction — parses page HTML to identify interactive elements
 * and groups them by semantic region.
 */
import type {
  DOMAnalysis,
  InteractiveElement,
  PageSnapshot,
  Region,
} from "./types.js";

/**
 * Extract interactive DOM elements from a page snapshot.
 *
 * @param snapshot - A captured page state snapshot.
 * @returns Structured DOM analysis with regions and interactive elements.
 */
export function extractDOM(snapshot: PageSnapshot): DOMAnalysis {
  const regions: Region[] = [];

  // Parse the accessibility tree to find interactive elements
  if (snapshot.accessibilityTree) {
    const flatElements = flattenAccessibilityTree(snapshot.accessibilityTree);
    const grouped = groupByRegion(flatElements);
    regions.push(...grouped);
  }

  // Also parse the raw HTML for elements the a11y tree might miss
  const htmlElements = extractFromHTML(snapshot.bodyHTML);
  mergeHTMLElements(regions, htmlElements);

  const totalInteractiveElements = regions.reduce(
    (sum, region) => sum + region.interactiveElements.length,
    0,
  );

  return {
    url: snapshot.url,
    regions,
    totalInteractiveElements,
  };
}

// ─── Accessibility Tree Parsing ────────────────────────────────────────────────

interface FlatA11yElement {
  role: string;
  name?: string;
  value?: string;
  parentRole?: string;
  parentName?: string;
  depth: number;
}

/**
 * Flatten the accessibility tree to a list of interactive elements.
 */
function flattenAccessibilityTree(
  node: NonNullable<PageSnapshot["accessibilityTree"]>,
  parentRole?: string,
  parentName?: string,
  depth = 0,
): FlatA11yElement[] {
  const elements: FlatA11yElement[] = [];

  const interactiveRoles = new Set([
    "button",
    "link",
    "textbox",
    "checkbox",
    "radio",
    "combobox",
    "listbox",
    "menuitem",
    "menuitemcheckbox",
    "menuitemradio",
    "option",
    "searchbox",
    "slider",
    "spinbutton",
    "switch",
    "tab",
    "treeitem",
  ]);

  if (interactiveRoles.has(node.role)) {
    elements.push({
      role: node.role,
      name: node.name,
      value: node.value,
      parentRole,
      parentName,
      depth,
    });
  }

  if (node.children) {
    const landmarkRoles = new Set([
      "banner",
      "navigation",
      "main",
      "contentinfo",
      "complementary",
      "form",
      "region",
      "dialog",
      "alertdialog",
    ]);

    const nextParentRole = landmarkRoles.has(node.role)
      ? node.role
      : parentRole;
    const nextParentName = landmarkRoles.has(node.role)
      ? node.name
      : parentName;

    for (const child of node.children) {
      elements.push(
        ...flattenAccessibilityTree(
          child,
          nextParentRole,
          nextParentName,
          depth + 1,
        ),
      );
    }
  }

  return elements;
}

/**
 * Group flat a11y elements into regions.
 */
function groupByRegion(elements: FlatA11yElement[]): Region[] {
  const regionMap = new Map<string, Region>();

  for (const el of elements) {
    const regionKey = el.parentRole ?? "unknown";
    const regionLabel = el.parentName;

    if (!regionMap.has(regionKey)) {
      regionMap.set(regionKey, {
        type: mapRoleToRegionType(regionKey),
        selector: buildRegionSelector(regionKey, regionLabel),
        label: regionLabel,
        interactiveElements: [],
      });
    }

    const region = regionMap.get(regionKey)!;
    region.interactiveElements.push(
      a11yToInteractiveElement(el),
    );
  }

  return Array.from(regionMap.values());
}

/**
 * Map an ARIA role to our region type.
 */
function mapRoleToRegionType(role: string): Region["type"] {
  const mapping: Record<string, Region["type"]> = {
    banner: "header",
    navigation: "nav",
    main: "main",
    contentinfo: "footer",
    complementary: "sidebar",
    form: "form",
    region: "section",
    dialog: "dialog",
    alertdialog: "dialog",
  };
  return mapping[role] ?? "unknown";
}

/**
 * Build a CSS selector for a region.
 */
function buildRegionSelector(role: string, label?: string): string {
  if (label) {
    return `[role="${role}"][aria-label="${label}"], ${roleToTag(role)}`;
  }
  return `[role="${role}"], ${roleToTag(role)}`;
}

/**
 * Map role to common HTML tag.
 */
function roleToTag(role: string): string {
  const mapping: Record<string, string> = {
    banner: "header",
    navigation: "nav",
    main: "main",
    contentinfo: "footer",
    complementary: "aside",
    form: "form",
    dialog: "dialog",
  };
  return mapping[role] ?? "section";
}

/**
 * Convert a flat a11y element to an InteractiveElement.
 */
function a11yToInteractiveElement(el: FlatA11yElement): InteractiveElement {
  const tag = roleToHTMLTag(el.role);
  return {
    tag,
    selector: buildElementSelector(el),
    ariaLabel: el.name,
    text: el.name,
    role: el.role,
    actionHint: inferActionHint(el.role),
  };
}

/**
 * Map ARIA role to typical HTML tag.
 */
function roleToHTMLTag(role: string): string {
  const mapping: Record<string, string> = {
    button: "button",
    link: "a",
    textbox: "input",
    checkbox: "input",
    radio: "input",
    combobox: "select",
    listbox: "select",
    searchbox: "input",
    slider: "input",
    spinbutton: "input",
    switch: "input",
    tab: "button",
    menuitem: "button",
  };
  return mapping[role] ?? "div";
}

/**
 * Build a CSS selector to find this element.
 */
function buildElementSelector(el: FlatA11yElement): string {
  const tag = roleToHTMLTag(el.role);
  if (el.name) {
    // Try aria-label first, then text content approach
    return `${tag}[aria-label="${el.name}"], ${tag}:has-text("${el.name}")`;
  }
  return `${tag}[role="${el.role}"]`;
}

/**
 * Infer the action hint from the ARIA role.
 */
function inferActionHint(
  role: string,
): InteractiveElement["actionHint"] {
  const mapping: Record<string, InteractiveElement["actionHint"]> = {
    button: "trigger",
    link: "navigation",
    textbox: "input",
    checkbox: "toggle",
    radio: "selection",
    combobox: "selection",
    listbox: "selection",
    searchbox: "input",
    slider: "input",
    spinbutton: "input",
    switch: "toggle",
    tab: "navigation",
    menuitem: "trigger",
  };
  return mapping[role] ?? "trigger";
}

// ─── HTML Parsing ──────────────────────────────────────────────────────────────

/**
 * Extract interactive elements from raw HTML using regex-based parsing.
 * This catches elements that the accessibility tree might miss
 * (e.g., elements with onclick handlers but no ARIA roles).
 */
function extractFromHTML(bodyHTML: string): InteractiveElement[] {
  const elements: InteractiveElement[] = [];

  // Match common interactive element patterns
  const patterns = [
    // Buttons
    {
      regex:
        /<button\b([^>]*)>([\s\S]*?)<\/button>/gi,
      tag: "button",
    },
    // Input elements
    {
      regex: /<input\b([^>]*)\/?\s*>/gi,
      tag: "input",
    },
    // Select elements
    {
      regex:
        /<select\b([^>]*)>[\s\S]*?<\/select>/gi,
      tag: "select",
    },
    // Textareas
    {
      regex:
        /<textarea\b([^>]*)>[\s\S]*?<\/textarea>/gi,
      tag: "textarea",
    },
    // Links with onclick or meaningful href
    {
      regex:
        /<a\b([^>]*(?:onclick|href="(?!#|javascript:void))[^>]*)>([\s\S]*?)<\/a>/gi,
      tag: "a",
    },
    // Elements with onclick handlers
    {
      regex:
        /<(\w+)\b([^>]*onclick="[^"]*"[^>]*)>([\s\S]*?)<\/\1>/gi,
      tag: "dynamic",
    },
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.regex.exec(bodyHTML)) !== null) {
      const attrs = match[1] ?? "";
      const textContent = match[2]?.replace(/<[^>]*>/g, "").trim();

      const element = parseHTMLAttributes(
        pattern.tag === "dynamic" ? (match[1] ?? "div") : pattern.tag,
        attrs,
        textContent,
      );
      if (element) {
        elements.push(element);
      }
    }
  }

  return elements;
}

/**
 * Parse HTML element attributes into an InteractiveElement.
 */
function parseHTMLAttributes(
  tag: string,
  attrsStr: string,
  textContent?: string,
): InteractiveElement | null {
  const getAttr = (name: string): string | undefined => {
    const match = new RegExp(`${name}="([^"]*)"`, "i").exec(attrsStr);
    return match?.[1];
  };

  const id = getAttr("id");
  const name = getAttr("name");
  const type = getAttr("type");
  const ariaLabel = getAttr("aria-label");
  const placeholder = getAttr("placeholder");
  const href = getAttr("href");
  const role = getAttr("role");

  // Build selector — prefer id, then name, then other attributes
  let selector: string;
  if (id) {
    selector = `#${id}`;
  } else if (name) {
    selector = `${tag}[name="${name}"]`;
  } else if (ariaLabel) {
    selector = `${tag}[aria-label="${ariaLabel}"]`;
  } else if (placeholder) {
    selector = `${tag}[placeholder="${placeholder}"]`;
  } else if (textContent) {
    selector = `${tag}:has-text("${textContent.slice(0, 50)}")`;
  } else {
    // Can't build a reliable selector
    return null;
  }

  // Extract data attributes
  const dataAttrs: Record<string, string> = {};
  const dataRegex = /data-([\w-]+)="([^"]*)"/gi;
  let dataMatch;
  while ((dataMatch = dataRegex.exec(attrsStr)) !== null) {
    dataAttrs[dataMatch[1]!] = dataMatch[2]!;
  }

  return {
    tag,
    type,
    selector,
    ariaLabel,
    text: textContent,
    name,
    id,
    placeholder,
    href,
    role: role ?? undefined,
    dataAttributes: Object.keys(dataAttrs).length > 0 ? dataAttrs : undefined,
    actionHint: inferTagActionHint(tag, type),
  };
}

/**
 * Infer action hint from HTML tag and type.
 */
function inferTagActionHint(
  tag: string,
  type?: string,
): InteractiveElement["actionHint"] {
  if (tag === "a") return "navigation";
  if (tag === "button") {
    if (type === "submit") return "submission";
    return "trigger";
  }
  if (tag === "input") {
    if (type === "checkbox" || type === "radio") return "toggle";
    if (type === "submit") return "submission";
    return "input";
  }
  if (tag === "select" || tag === "listbox") return "selection";
  if (tag === "textarea") return "input";
  return "trigger";
}

/**
 * Merge HTML-extracted elements into region-grouped results,
 * avoiding duplicates (same selector).
 */
function mergeHTMLElements(
  regions: Region[],
  htmlElements: InteractiveElement[],
): void {
  // Collect all existing selectors
  const existingSelectors = new Set<string>();
  for (const region of regions) {
    for (const el of region.interactiveElements) {
      existingSelectors.add(el.selector);
    }
  }

  // Find or create the "unknown" region for elements not matched to a region
  let unknownRegion = regions.find((r) => r.type === "unknown");

  for (const el of htmlElements) {
    if (existingSelectors.has(el.selector)) continue;

    if (!unknownRegion) {
      unknownRegion = {
        type: "unknown",
        selector: "body",
        interactiveElements: [],
      };
      regions.push(unknownRegion);
    }

    unknownRegion.interactiveElements.push(el);
    existingSelectors.add(el.selector);
  }
}
