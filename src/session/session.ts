/**
 * Interactive browser session manager.
 *
 * Provides start/step/screenshot/close operations for agent-driven
 * Playwright exploration. Each action is recorded; on close, tagged
 * steps are grouped into tool definitions.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type { BrowserServer, Page } from "playwright";
import type {
  SessionState,
  ActionLogEntry,
  ToolFromActions,
  ToolActionStep,
} from "./types.js";

// ─── Start ─────────────────────────────────────────────────────────────────────

export interface SessionStartOptions {
  /** Goal description for the exploration. */
  goal?: string;
  /** Whether to run headful (default: false → headless). */
  headful?: boolean;
  /** Viewport width (default: 1280). */
  viewportWidth?: number;
  /** Viewport height (default: 720). */
  viewportHeight?: number;
}

/**
 * Start a new interactive browser session.
 *
 * Launches a Playwright browser server, navigates to the URL,
 * captures an initial screenshot, and persists session state.
 */
export async function sessionStart(
  url: string,
  sessionDir: string,
  options: SessionStartOptions = {},
): Promise<{ sessionDir: string; screenshotPath: string }> {
  const {
    goal,
    headful = false,
    viewportWidth = 1280,
    viewportHeight = 720,
  } = options;

  // Ensure session directory exists
  fs.mkdirSync(sessionDir, { recursive: true });

  const { chromium } = await import("playwright");

  // Launch a persistent browser server so we can reconnect later
  const server: BrowserServer = await chromium.launchServer({
    headless: !headful,
  });
  const wsEndpoint = server.wsEndpoint();

  // Connect and navigate
  const browser = await chromium.connect(wsEndpoint);
  const context = await browser.newContext({
    viewport: { width: viewportWidth, height: viewportHeight },
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "networkidle" });

  // Capture initial screenshot
  const screenshotPath = path.join(sessionDir, "screenshot-latest.png");
  await page.screenshot({ path: screenshotPath, type: "png", fullPage: false });

  // Initialize action log
  const actionLogPath = path.join(sessionDir, "action-log.json");
  fs.writeFileSync(actionLogPath, "[]", "utf-8");

  // Save session state
  const state: SessionState = {
    wsEndpoint,
    goal,
    currentUrl: page.url(),
    stepCount: 0,
    startedAt: Date.now(),
    sessionDir,
  };
  fs.writeFileSync(
    path.join(sessionDir, "session.json"),
    JSON.stringify(state, null, 2),
    "utf-8",
  );

  // Disconnect (don't close — server keeps running)
  await browser.close();

  return { sessionDir, screenshotPath };
}

// ─── Step ──────────────────────────────────────────────────────────────────────

export interface SessionStepOptions {
  /** The action to perform. */
  action: "click" | "fill" | "select" | "hover" | "scroll" | "wait" | "navigate";
  /** CSS selector of the target element. */
  selector?: string;
  /** Value for fill/select actions. */
  value?: string;
  /** URL for navigate action. */
  url?: string;
  /** Tool name to tag this step with. */
  toolName?: string;
}

/**
 * Execute a single action in the session and record it.
 *
 * Connects to the running browser server, performs the action,
 * captures a screenshot, and appends to the action log.
 */
export async function sessionStep(
  sessionDir: string,
  options: SessionStepOptions,
): Promise<{ screenshotPath: string; entry: ActionLogEntry }> {
  const state = readSessionState(sessionDir);
  const { chromium } = await import("playwright");

  const browser = await chromium.connect(state.wsEndpoint);
  const contexts = browser.contexts();
  const context = contexts[0] ?? (await browser.newContext());
  const pages = context.pages();
  const page = pages[0] ?? (await context.newPage());

  let success = true;
  let error: string | undefined;

  try {
    await executeAction(page, options);
    // Brief wait for page to settle after action
    await page.waitForTimeout(500);
  } catch (e: unknown) {
    success = false;
    error = e instanceof Error ? e.message : String(e);
  }

  // Capture screenshot
  const screenshotPath = path.join(sessionDir, "screenshot-latest.png");
  await page.screenshot({ path: screenshotPath, type: "png", fullPage: false });

  // Build log entry
  const entry: ActionLogEntry = {
    stepIndex: state.stepCount,
    action: options.action,
    selector: options.selector,
    value: options.value,
    url: options.url,
    toolName: options.toolName,
    pageUrl: page.url(),
    screenshotPath,
    timestamp: Date.now(),
    success,
    error,
  };

  // Append to action log
  const actionLogPath = path.join(sessionDir, "action-log.json");
  const log: ActionLogEntry[] = JSON.parse(
    fs.readFileSync(actionLogPath, "utf-8"),
  );
  log.push(entry);
  fs.writeFileSync(actionLogPath, JSON.stringify(log, null, 2), "utf-8");

  // Update session state
  state.stepCount += 1;
  state.currentUrl = page.url();
  fs.writeFileSync(
    path.join(sessionDir, "session.json"),
    JSON.stringify(state, null, 2),
    "utf-8",
  );

  await browser.close();

  return { screenshotPath, entry };
}

// ─── Screenshot ────────────────────────────────────────────────────────────────

/**
 * Capture a screenshot of the current page without performing any action.
 */
export async function sessionScreenshot(
  sessionDir: string,
): Promise<{ screenshotPath: string }> {
  const state = readSessionState(sessionDir);
  const { chromium } = await import("playwright");

  const browser = await chromium.connect(state.wsEndpoint);
  const contexts = browser.contexts();
  const context = contexts[0] ?? (await browser.newContext());
  const pages = context.pages();
  const page = pages[0] ?? (await context.newPage());

  const screenshotPath = path.join(sessionDir, "screenshot-latest.png");
  await page.screenshot({ path: screenshotPath, type: "png", fullPage: false });

  await browser.close();

  return { screenshotPath };
}

// ─── Close ─────────────────────────────────────────────────────────────────────

/**
 * Close the session, stop the browser server, and generate tools.json
 * from tagged action log entries.
 */
export async function sessionClose(
  sessionDir: string,
): Promise<{ toolsPath: string; tools: ToolFromActions[] }> {
  const state = readSessionState(sessionDir);
  const { chromium } = await import("playwright");

  // Connect just to close cleanly
  try {
    const browser = await chromium.connect(state.wsEndpoint);
    await browser.close();
  } catch {
    // Browser may already be closed
  }

  // Read action log and group into tools
  const actionLogPath = path.join(sessionDir, "action-log.json");
  const log: ActionLogEntry[] = JSON.parse(
    fs.readFileSync(actionLogPath, "utf-8"),
  );

  const tools = groupActionsIntoTools(log);

  // Write tools.json
  const toolsPath = path.join(sessionDir, "tools.json");
  fs.writeFileSync(toolsPath, JSON.stringify(tools, null, 2), "utf-8");

  return { toolsPath, tools };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function readSessionState(sessionDir: string): SessionState {
  const statePath = path.join(sessionDir, "session.json");
  if (!fs.existsSync(statePath)) {
    throw new Error(`No active session found in ${sessionDir}. Run "session start" first.`);
  }
  return JSON.parse(fs.readFileSync(statePath, "utf-8")) as SessionState;
}

async function executeAction(page: Page, opts: SessionStepOptions): Promise<void> {
  switch (opts.action) {
    case "click":
      if (!opts.selector) throw new Error("Click requires a selector");
      await page.click(opts.selector);
      break;
    case "fill":
      if (!opts.selector) throw new Error("Fill requires a selector");
      await page.fill(opts.selector, opts.value ?? "");
      break;
    case "select":
      if (!opts.selector) throw new Error("Select requires a selector");
      await page.selectOption(opts.selector, opts.value ?? "");
      break;
    case "hover":
      if (!opts.selector) throw new Error("Hover requires a selector");
      await page.hover(opts.selector);
      break;
    case "scroll":
      if (opts.selector) {
        await page.locator(opts.selector).scrollIntoViewIfNeeded();
      } else {
        await page.evaluate(() => window.scrollBy(0, 500));
      }
      break;
    case "wait":
      if (opts.selector) {
        await page.waitForSelector(opts.selector);
      } else if (opts.value) {
        const ms = parseInt(opts.value, 10);
        if (!isNaN(ms)) await page.waitForTimeout(ms);
      }
      break;
    case "navigate":
      if (!opts.url) throw new Error("Navigate requires a url");
      await page.goto(opts.url, { waitUntil: "networkidle" });
      break;
    default:
      throw new Error(`Unknown action: ${opts.action}`);
  }
}

/**
 * Group tagged action log entries into tool definitions.
 * Steps with the same toolName are combined into a single tool.
 * Steps without a toolName are skipped (navigation-only actions).
 */
function groupActionsIntoTools(log: ActionLogEntry[]): ToolFromActions[] {
  // Collect steps by tool name, preserving order
  const toolMap = new Map<string, ActionLogEntry[]>();
  for (const entry of log) {
    if (!entry.toolName || !entry.success) continue;
    const existing = toolMap.get(entry.toolName);
    if (existing) {
      existing.push(entry);
    } else {
      toolMap.set(entry.toolName, [entry]);
    }
  }

  const tools: ToolFromActions[] = [];

  for (const [name, entries] of toolMap) {
    const steps: ToolActionStep[] = [];
    const properties: Record<string, { type: string; description: string }> = {};
    const required: string[] = [];
    const urlPatterns = new Set<string>();

    for (const entry of entries) {
      urlPatterns.add(entry.pageUrl);

      if (entry.action === "wait" || entry.action === "navigate") continue;

      const step: ToolActionStep = {
        action: entry.action as ToolActionStep["action"],
        selector: entry.selector ?? "",
      };

      // For fill/select, infer input property from selector
      if ((entry.action === "fill" || entry.action === "select") && entry.value) {
        const propName = inferPropertyName(entry.selector ?? "", entry.action);
        step.inputProperty = propName;
        properties[propName] = {
          type: "string",
          description: `Value for ${entry.selector}`,
        };
        required.push(propName);
      }

      steps.push(step);
    }

    tools.push({
      name,
      steps,
      inputSchema: { type: "object", properties, required },
      urlPatterns: [...urlPatterns],
    });
  }

  return tools;
}

/**
 * Infer a camelCase property name from a CSS selector.
 * e.g., "#email-input" → "email", "[name='firstName']" → "firstName"
 */
function inferPropertyName(selector: string, action: string): string {
  // Try name attribute: [name="foo"]
  const nameMatch = selector.match(/\[name=["']?([^"'\]]+)/);
  if (nameMatch) return toCamelCase(nameMatch[1]!);

  // Try id: #foo-bar
  const idMatch = selector.match(/#([\w-]+)/);
  if (idMatch) return toCamelCase(idMatch[1]!);

  // Try placeholder or other attributes
  const attrMatch = selector.match(/\[placeholder=["']?([^"'\]]+)/);
  if (attrMatch) return toCamelCase(attrMatch[1]!);

  // Fallback
  return `${action}Value`;
}

function toCamelCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c: string | undefined) =>
      c ? c.toUpperCase() : "",
    )
    .replace(/^[A-Z]/, (c) => c.toLowerCase());
}
