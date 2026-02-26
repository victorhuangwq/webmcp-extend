/**
 * Playwright-based page crawler.
 *
 * Launches a browser, navigates to the target URL, executes scenario steps,
 * and captures page state snapshots at each stage.
 */
import type { Browser, Page } from "playwright";
import type {
  AccessibilityNode,
  PageSnapshot,
  ScenarioStep,
  Screenshot,
} from "./types.js";

export interface CrawlOptions {
  /** Whether to run in headless mode (default: true). */
  headless?: boolean;
  /** Viewport width (default: 1280). */
  viewportWidth?: number;
  /** Viewport height (default: 720). */
  viewportHeight?: number;
  /** Whether to capture screenshots (default: true). */
  screenshots?: boolean;
  /** Maximum time to wait for page load in ms (default: 30000). */
  timeout?: number;
  /** User agent override. */
  userAgent?: string;
}

/**
 * Crawl a website and capture page state snapshots.
 *
 * @param url - The initial URL to navigate to.
 * @param steps - Optional scenario steps to execute.
 * @param options - Crawl configuration options.
 * @returns An array of page state snapshots.
 */
export async function crawlSite(
  url: string,
  steps: ScenarioStep[] = [],
  options: CrawlOptions = {},
): Promise<PageSnapshot[]> {
  const {
    headless = true,
    viewportWidth = 1280,
    viewportHeight = 720,
    screenshots = true,
    timeout = 30_000,
    userAgent,
  } = options;

  // Dynamic import — playwright is a heavy dependency
  const { chromium } = await import("playwright");

  let browser: Browser | null = null;
  const snapshots: PageSnapshot[] = [];

  try {
    browser = await chromium.launch({ headless });
    const context = await browser.newContext({
      viewport: { width: viewportWidth, height: viewportHeight },
      ...(userAgent ? { userAgent } : {}),
    });
    const page = await context.newPage();
    page.setDefaultTimeout(timeout);

    // Navigate to the initial URL
    await page.goto(url, { waitUntil: "networkidle" });
    snapshots.push(await captureSnapshot(page, -1, screenshots));

    // Execute scenario steps
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]!;
      await executeStep(page, step);
      snapshots.push(await captureSnapshot(page, i, screenshots));
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  return snapshots;
}

/**
 * Execute a single scenario step on the page.
 */
async function executeStep(page: Page, step: ScenarioStep): Promise<void> {
  switch (step.action) {
    case "navigate": {
      if (!step.url) throw new Error("Navigate step requires a url");
      await page.goto(step.url, { waitUntil: "networkidle" });
      break;
    }
    case "click": {
      if (!step.selector) throw new Error("Click step requires a selector");
      await page.click(step.selector);
      break;
    }
    case "fill": {
      if (!step.selector) throw new Error("Fill step requires a selector");
      await page.fill(step.selector, step.value ?? "");
      break;
    }
    case "select": {
      if (!step.selector) throw new Error("Select step requires a selector");
      await page.selectOption(step.selector, step.value ?? "");
      break;
    }
    case "hover": {
      if (!step.selector) throw new Error("Hover step requires a selector");
      await page.hover(step.selector);
      break;
    }
    case "wait": {
      if (step.selector) {
        await page.waitForSelector(step.selector);
      } else if (step.value) {
        const ms = parseInt(step.value, 10);
        if (!isNaN(ms)) {
          await page.waitForTimeout(ms);
        }
      }
      break;
    }
    default:
      throw new Error(`Unknown scenario step action: ${step.action}`);
  }

  // Post-action wait condition
  if (step.waitFor) {
    if (step.waitFor === "networkidle") {
      await page.waitForLoadState("networkidle");
    } else {
      await page.waitForSelector(step.waitFor);
    }
  }
}

/**
 * Capture a snapshot of the current page state.
 */
async function captureSnapshot(
  page: Page,
  stepIndex: number,
  includeScreenshot: boolean,
): Promise<PageSnapshot> {
  const [url, title, bodyHTML, accessibilityTree, screenshot] =
    await Promise.all([
      page.url(),
      page.title(),
      page.evaluate(() => document.body?.outerHTML ?? ""),
      captureAccessibilityTree(page),
      includeScreenshot ? captureScreenshot(page) : Promise.resolve(undefined),
    ]);

  return {
    url,
    title,
    bodyHTML,
    accessibilityTree,
    screenshot,
    timestamp: Date.now(),
    stepIndex,
  };
}

/**
 * Capture the page's accessibility tree via locator.ariaSnapshot().
 *
 * Playwright ≥1.49 removed the legacy `page.accessibility.snapshot()` API.
 * We use `page.locator("body").ariaSnapshot()` which returns a YAML-like
 * string representing the aria tree, then wrap it into our AccessibilityNode shape.
 */
async function captureAccessibilityTree(
  page: Page,
): Promise<AccessibilityNode | null> {
  try {
    const ariaYaml = await page.locator("body").ariaSnapshot();
    // ariaSnapshot() returns a YAML-like string; wrap it in our node shape
    return {
      role: "RootWebArea",
      name: await page.title(),
      children: [],
      // Keep the raw aria text for downstream analysis
      value: ariaYaml,
    } as AccessibilityNode;
  } catch {
    // Accessibility snapshot may not be available on all pages
    return null;
  }
}

/**
 * Capture a screenshot of the page.
 */
async function captureScreenshot(page: Page): Promise<Screenshot> {
  const buffer = await page.screenshot({ type: "png", fullPage: false });
  const viewport = page.viewportSize();
  return {
    data: buffer.toString("base64"),
    width: viewport?.width ?? 1280,
    height: viewport?.height ?? 720,
  };
}
