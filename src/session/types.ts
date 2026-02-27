/**
 * Types for the interactive browser session system.
 * The agent drives Playwright step-by-step; each action becomes a tool definition.
 */

// ─── Session State ─────────────────────────────────────────────────────────────

/** Persisted session state (written to session.json). */
export interface SessionState {
  /** WebSocket endpoint for reconnecting to the browser server. */
  wsEndpoint: string;
  /** The goal the agent is trying to accomplish. */
  goal?: string;
  /** Current page URL. */
  currentUrl: string;
  /** Number of steps executed so far. */
  stepCount: number;
  /** Timestamp when session was started. */
  startedAt: number;
  /** Path to the session directory. */
  sessionDir: string;
}

// ─── Action Log ────────────────────────────────────────────────────────────────

/** A single recorded action in the session. */
export interface ActionLogEntry {
  /** Step index (0-based). */
  stepIndex: number;
  /** The action performed. */
  action: "click" | "fill" | "select" | "hover" | "scroll" | "wait" | "navigate";
  /** CSS selector of the target element. */
  selector?: string;
  /** Value used (for fill/select). */
  value?: string;
  /** URL navigated to (for navigate action). */
  url?: string;
  /** Tool name this step is tagged with (steps with same name are grouped). */
  toolName?: string;
  /** The page URL when this action was performed. */
  pageUrl: string;
  /** Path to the screenshot captured after this action. */
  screenshotPath: string;
  /** Timestamp of the action. */
  timestamp: number;
  /** Whether the action succeeded. */
  success: boolean;
  /** Error message if the action failed. */
  error?: string;
}

// ─── Tool from Actions ─────────────────────────────────────────────────────────

/** A tool definition derived from grouped session actions. */
export interface ToolFromActions {
  /** Tool name (from --tool-name tags). */
  name: string;
  /** Steps that make up this tool, in execution order. */
  steps: ToolActionStep[];
  /** Inferred input schema from the values used during exploration. */
  inputSchema: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
  /** URL patterns where this tool was used. */
  urlPatterns: string[];
}

/** A single step within a tool, derived from a recorded action. */
export interface ToolActionStep {
  /** The action to perform. */
  action: "click" | "fill" | "select" | "hover" | "scroll";
  /** CSS selector of the target element. */
  selector: string;
  /** Input property name (inferred from the value used). */
  inputProperty?: string;
  /** Static value (if not parameterized). */
  staticValue?: string;
  /** Delay in ms after this step. */
  delay?: number;
}
