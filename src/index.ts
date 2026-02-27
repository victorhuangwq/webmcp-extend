/**
 * webmcp-extend — Autopilot WebMCP tools onto any website.
 *
 * Programmatic API entry point. Re-exports all public modules.
 */

// Analysis pipeline
export { crawlSite, type CrawlOptions } from "./analysis/crawl.js";
export { extractDOM } from "./analysis/extract-dom.js";
export { extractJS, type EvaluatablePage } from "./analysis/extract-js.js";
export {
  buildToolProposalPrompt,
  parseToolProposals,
} from "./analysis/propose-tools.js";

// Generator
export { generateToolFiles } from "./generator/generate-tools.js";
export {
  generateToolManifest,
  toMatchPattern,
  type ManifestOptions,
} from "./generator/generate-manifest.js";
export {
  generateExtension,
  type GenerateExtensionOptions,
} from "./generator/generate-extension.js";
export { exportToKit } from "./generator/export-to-kit.js";

// Session
export {
  sessionStart,
  sessionStep,
  sessionScreenshot,
  sessionClose,
  type SessionStartOptions,
  type SessionStepOptions,
} from "./session/session.js";
export { convertSessionToolsToProposals } from "./session/convert.js";

// Types
export type {
  // Analysis types
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
} from "./analysis/types.js";

export type {
  // Session types
  SessionState,
  ActionLogEntry,
  ToolFromActions,
  ToolActionStep,
} from "./session/types.js";
