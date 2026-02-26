export { crawlSite, type CrawlOptions } from "./crawl.js";
export { extractDOM } from "./extract-dom.js";
export { extractJS, type EvaluatablePage } from "./extract-js.js";
export { buildToolProposalPrompt, parseToolProposals } from "./propose-tools.js";
export type {
  AccessibilityNode,
  DOMAction,
  DOMActionStep,
  DOMAnalysis,
  DataLayerEntry,
  EventHandlerEntry,
  ExposedAPIEntry,
  GeneratedFile,
  GlobalEntry,
  InteractiveElement,
  JSAnalysis,
  JSCallAction,
  PageSnapshot,
  Region,
  ScenarioStep,
  Screenshot,
  SiteAnalysis,
  ToolInputProperty,
  ToolInputSchema,
  ToolManifest,
  ToolProposal,
  ToolProposalAnnotations,
} from "./types.js";
