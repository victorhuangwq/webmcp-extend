/**
 * Shared types for the webmcp-extend analysis pipeline.
 */

// ─── Crawl Types ───────────────────────────────────────────────────────────────

/** A single step in a user scenario for the crawler to execute. */
export interface ScenarioStep {
  /** The action to perform on the page. */
  action: "click" | "fill" | "navigate" | "select" | "hover" | "wait";
  /** CSS selector for the target element (required for click, fill, select, hover). */
  selector?: string;
  /** Value to fill or select. */
  value?: string;
  /** URL to navigate to (for navigate action). */
  url?: string;
  /** Wait condition after the action — e.g., a selector to wait for, or "networkidle". */
  waitFor?: string;
  /** Human description of this step for agent context. */
  description?: string;
}

/** A screenshot captured from the page. */
export interface Screenshot {
  /** Base64-encoded PNG data. */
  data: string;
  /** Width in pixels. */
  width: number;
  /** Height in pixels. */
  height: number;
}

/** A snapshot of the page state at a moment in time. */
export interface PageSnapshot {
  /** The URL at the time of the snapshot. */
  url: string;
  /** The page title. */
  title: string;
  /** The outer HTML of the document body (trimmed). */
  bodyHTML: string;
  /** The accessibility tree snapshot (Playwright format). */
  accessibilityTree: AccessibilityNode | null;
  /** Screenshot of the page. */
  screenshot?: Screenshot;
  /** Timestamp of capture. */
  timestamp: number;
  /** Which scenario step triggered this snapshot (index), or -1 for initial load. */
  stepIndex: number;
}

/** Playwright accessibility node (recursive). */
export interface AccessibilityNode {
  role: string;
  name?: string;
  value?: string;
  description?: string;
  checked?: boolean | "mixed";
  disabled?: boolean;
  expanded?: boolean;
  focused?: boolean;
  modal?: boolean;
  pressed?: boolean | "mixed";
  selected?: boolean;
  children?: AccessibilityNode[];
}

// ─── DOM Extraction Types ──────────────────────────────────────────────────────

/** Analysis result from DOM extraction. */
export interface DOMAnalysis {
  /** The URL this analysis was extracted from. */
  url: string;
  /** Semantic regions on the page, each containing interactive elements. */
  regions: Region[];
  /** Total count of interactive elements found. */
  totalInteractiveElements: number;
}

/** A semantic region of the page (nav, main, form, modal, etc.). */
export interface Region {
  /** The type of region. */
  type: "nav" | "main" | "sidebar" | "modal" | "form" | "footer" | "header" | "dialog" | "section" | "unknown";
  /** CSS selector to the region's container element. */
  selector: string;
  /** ARIA label or landmark name, if any. */
  label?: string;
  /** Interactive elements within this region. */
  interactiveElements: InteractiveElement[];
}

/** An interactive DOM element that could become a tool action. */
export interface InteractiveElement {
  /** The HTML tag name. */
  tag: string;
  /** The type attribute (for input, button, etc.). */
  type?: string;
  /** CSS selector that uniquely identifies this element. */
  selector: string;
  /** ARIA label, if present. */
  ariaLabel?: string;
  /** Visible text content (trimmed). */
  text?: string;
  /** The name attribute (for form elements). */
  name?: string;
  /** The id attribute. */
  id?: string;
  /** Placeholder text (for inputs). */
  placeholder?: string;
  /** The href attribute (for links). */
  href?: string;
  /** The form action (for forms/submit buttons). */
  formAction?: string;
  /** Whether this element is required (for form fields). */
  required?: boolean;
  /** Available options (for select elements). */
  options?: Array<{ value: string; text: string }>;
  /** Data attributes that may be useful (data-testid, data-action, etc.). */
  dataAttributes?: Record<string, string>;
  /** The role attribute if explicitly set. */
  role?: string;
  /** Semantic classification: what kind of action this element performs. */
  actionHint?: "navigation" | "submission" | "toggle" | "input" | "selection" | "trigger" | "destructive";
}

// ─── JS Extraction Types ───────────────────────────────────────────────────────

/** Analysis result from JS surface extraction. */
export interface JSAnalysis {
  /** The URL this analysis was extracted from. */
  url: string;
  /** Global functions found on the window object. */
  globals: GlobalEntry[];
  /** Data layer objects detected. */
  dataLayers: DataLayerEntry[];
  /** Event handler attributes found in the DOM. */
  eventHandlers: EventHandlerEntry[];
  /** Exposed module APIs and public methods. */
  exposedAPIs: ExposedAPIEntry[];
}

/** A global function or object on the window. */
export interface GlobalEntry {
  /** The property path, e.g., "window.addToCart" or "window.app.search". */
  path: string;
  /** The typeof the value. */
  type: "function" | "object" | "string" | "number" | "boolean";
  /** For functions: detected parameter names (from toString). */
  params?: string[];
  /** For objects: list of method names. */
  methods?: string[];
  /** Brief description from JSDoc or inferred context. */
  description?: string;
}

/** A detected data layer. */
export interface DataLayerEntry {
  /** The property path (e.g., "window.dataLayer", "window.__NEXT_DATA__"). */
  path: string;
  /** The type of data layer. */
  framework: "gtm" | "next" | "nuxt" | "redux" | "custom";
  /** Top-level keys in the data layer object. */
  keys: string[];
  /** Whether this is an array (dataLayer) or object. */
  shape: "array" | "object";
}

/** An event handler attribute on a DOM element. */
export interface EventHandlerEntry {
  /** CSS selector of the element with this handler. */
  selector: string;
  /** The event type (click, submit, change, etc.). */
  event: string;
  /** The handler code (from attribute value). */
  handlerCode: string;
  /** Visible text of the element for context. */
  elementText?: string;
}

/** An exposed module API or public interface. */
export interface ExposedAPIEntry {
  /** The property path (e.g., "window.api", "window.SDK"). */
  path: string;
  /** Available methods on this API. */
  methods: Array<{
    name: string;
    params?: string[];
    description?: string;
  }>;
}

// ─── Tool Proposal Types ───────────────────────────────────────────────────────

/** A proposed tool definition generated from site analysis. */
export interface ToolProposal {
  /** Tool name (camelCase, descriptive). */
  name: string;
  /** Human-readable description of what this tool does. */
  description: string;
  /** JSON Schema for the tool's input parameters. */
  inputSchema: ToolInputSchema;
  /** How this tool executes: calling page JS directly, or manipulating DOM. */
  actionType: "js-call" | "dom-action";
  /** Details of the action to perform. */
  actionDetails: JSCallAction | DOMAction;
  /** Tool annotations (readOnlyHint, destructiveHint, etc.). */
  annotations?: ToolProposalAnnotations;
  /** Which page/URL pattern this tool applies to. */
  urlPattern?: string;
}

/** JSON Schema representation for tool input. */
export interface ToolInputSchema {
  type: "object";
  properties: Record<string, ToolInputProperty>;
  required?: string[];
}

/** A single property in the tool input schema. */
export interface ToolInputProperty {
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  enum?: string[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  items?: ToolInputProperty;
}

/** Action details for a JS-call tool. */
export interface JSCallAction {
  /** The global path to call, e.g., "window.addToCart". */
  functionPath: string;
  /** How to map input schema properties to function arguments. */
  argMapping: string[];
  /** Expected return type. */
  returnType?: "void" | "string" | "object" | "array" | "boolean" | "number";
}

/** Action details for a DOM-action tool. */
export interface DOMAction {
  /** Ordered steps to perform on the DOM. */
  steps: DOMActionStep[];
}

/** A single step in a DOM action sequence. */
export interface DOMActionStep {
  /** The action to perform. */
  action: "click" | "fill" | "select" | "check" | "submit" | "scroll" | "read";
  /** CSS selector of the target element. */
  selector: string;
  /** For fill/select: the input property name to use as the value. */
  inputProperty?: string;
  /** For fill: static value to use (if not from input). */
  staticValue?: string;
  /** Delay in ms after this step (for animations, etc.). */
  delay?: number;
  /** For read: what to extract from the element. */
  readAttribute?: "textContent" | "value" | "innerHTML" | "outerHTML" | string;
  /** Human description of this step. */
  description?: string;
}

/** Annotations for a proposed tool. */
export interface ToolProposalAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  confirmationHint?: boolean;
  openWorldHint?: boolean;
}

// ─── Combined Analysis ─────────────────────────────────────────────────────────

/** Combined site analysis result from all extraction phases. */
export interface SiteAnalysis {
  /** The target URL that was analyzed. */
  targetUrl: string;
  /** User's scenario description. */
  scenario?: string;
  /** Page snapshots from the crawl. */
  snapshots: PageSnapshot[];
  /** DOM analysis per snapshot. */
  domAnalyses: DOMAnalysis[];
  /** JS analysis (one per unique URL). */
  jsAnalyses: JSAnalysis[];
  /** Generated prompt for the agent to propose tools. */
  proposalPrompt: string;
  /** Timestamp of the analysis. */
  timestamp: number;
}

// ─── Generator Types ───────────────────────────────────────────────────────────

/** A generated file with its content. */
export interface GeneratedFile {
  /** Relative path within the output directory. */
  path: string;
  /** The file content. */
  content: string;
}

/** Mapping of URL patterns to tool file paths. */
export interface ToolManifest {
  /** Map from URL glob pattern to array of tool file relative paths. */
  patterns: Record<string, string[]>;
  /** All tool names across all patterns. */
  toolNames: string[];
  /** The generated extension name. */
  extensionName: string;
  /** Version string. */
  version: string;
}
