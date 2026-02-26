/**
 * JS surface extraction — discovers global functions, data layers,
 * event handlers, and exposed APIs on the page.
 *
 * Runs page.evaluate() in the browser context to inspect window properties.
 */
import type {
  DataLayerEntry,
  EventHandlerEntry,
  ExposedAPIEntry,
  GlobalEntry,
  JSAnalysis,
} from "./types.js";

/** Page-like interface — decoupled from Playwright for testability. */
export interface EvaluatablePage {
  evaluate<T>(fn: () => T): Promise<T>;
  evaluate<T, A>(fn: (arg: A) => T, arg: A): Promise<T>;
  url(): string;
}

/**
 * Extract the JS surface of a page.
 *
 * @param page - A Playwright Page (or anything with evaluate + url).
 * @returns JS analysis result.
 */
export async function extractJS(page: EvaluatablePage): Promise<JSAnalysis> {
  const url = typeof page.url === "function" ? page.url() : "";

  const [globals, dataLayers, eventHandlers, exposedAPIs] = await Promise.all([
    extractGlobals(page),
    extractDataLayers(page),
    extractEventHandlers(page),
    extractExposedAPIs(page),
  ]);

  return {
    url,
    globals,
    dataLayers,
    eventHandlers,
    exposedAPIs,
  };
}

// ─── Globals ───────────────────────────────────────────────────────────────────

/**
 * Discover global functions and objects on window.
 */
async function extractGlobals(page: EvaluatablePage): Promise<GlobalEntry[]> {
  return page.evaluate(() => {
    const results: Array<{
      path: string;
      type: string;
      params?: string[];
      methods?: string[];
    }> = [];

    // Properties that are standard browser globals — skip these
    const builtinProps = new Set([
      "window",
      "self",
      "document",
      "location",
      "navigator",
      "history",
      "screen",
      "performance",
      "localStorage",
      "sessionStorage",
      "console",
      "alert",
      "confirm",
      "prompt",
      "fetch",
      "XMLHttpRequest",
      "setTimeout",
      "setInterval",
      "clearTimeout",
      "clearInterval",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "addEventListener",
      "removeEventListener",
      "dispatchEvent",
      "postMessage",
      "close",
      "open",
      "print",
      "stop",
      "focus",
      "blur",
      "scroll",
      "scrollTo",
      "scrollBy",
      "getComputedStyle",
      "getSelection",
      "matchMedia",
      "atob",
      "btoa",
      "crypto",
      "indexedDB",
      "caches",
      "origin",
      "isSecureContext",
      "crossOriginIsolated",
      "frames",
      "parent",
      "top",
      "opener",
      "name",
      "length",
      "closed",
      "clientInformation",
      "customElements",
      "devicePixelRatio",
      "external",
      "innerHeight",
      "innerWidth",
      "outerHeight",
      "outerWidth",
      "pageXOffset",
      "pageYOffset",
      "screenLeft",
      "screenTop",
      "screenX",
      "screenY",
      "scrollX",
      "scrollY",
      "visualViewport",
      "styleMedia",
      "chrome",
      "speechSynthesis",
    ]);

    const allProps = Object.getOwnPropertyNames(window);

    for (const prop of allProps) {
      if (builtinProps.has(prop)) continue;
      if (prop.startsWith("on")) continue; // Event handlers like onclick
      if (prop.startsWith("webkit")) continue;
      if (prop.startsWith("__zone")) continue; // Angular zone.js internals
      if (prop === "zone" || prop === "Zone") continue;

      try {
        const val = (window as unknown as Record<string, unknown>)[prop];
        if (val === undefined || val === null) continue;

        const type = typeof val;

        if (type === "function") {
          // Extract parameter names from function source
          const fnStr = val.toString().slice(0, 200);
          const paramMatch = fnStr.match(/\(([^)]*)\)/);
          const params = paramMatch?.[1]
            ?.split(",")
            .map((p: string) => p.trim())
            .filter(Boolean);

          results.push({
            path: `window.${prop}`,
            type: "function",
            params: params?.length ? params : undefined,
          });
        } else if (type === "object" && !Array.isArray(val)) {
          // Check for objects with callable methods
          const methods = Object.getOwnPropertyNames(val)
            .filter((m) => {
              try {
                return typeof (val as Record<string, unknown>)[m] === "function";
              } catch {
                return false;
              }
            })
            .slice(0, 20); // Limit to prevent noise

          if (methods.length > 0) {
            results.push({
              path: `window.${prop}`,
              type: "object",
              methods,
            });
          }
        }
      } catch {
        // Some properties throw on access — skip
      }
    }

    return results.slice(0, 50); // Cap at 50 entries
  }) as Promise<GlobalEntry[]>;
}

// ─── Data Layers ───────────────────────────────────────────────────────────────

/**
 * Detect known data layer patterns (GTM, Next.js, Nuxt, Redux, etc.).
 */
async function extractDataLayers(
  page: EvaluatablePage,
): Promise<DataLayerEntry[]> {
  return page.evaluate(() => {
    const layers: Array<{
      path: string;
      framework: string;
      keys: string[];
      shape: string;
    }> = [];

    const win = window as unknown as Record<string, unknown>;

    // Google Tag Manager dataLayer
    if (Array.isArray(win.dataLayer)) {
      layers.push({
        path: "window.dataLayer",
        framework: "gtm",
        keys: win.dataLayer.length > 0
          ? Object.keys(win.dataLayer[0] as object)
          : [],
        shape: "array",
      });
    }

    // Next.js
    if (win.__NEXT_DATA__ && typeof win.__NEXT_DATA__ === "object") {
      layers.push({
        path: "window.__NEXT_DATA__",
        framework: "next",
        keys: Object.keys(win.__NEXT_DATA__),
        shape: "object",
      });
    }

    // Nuxt
    if (win.__NUXT__ && typeof win.__NUXT__ === "object") {
      layers.push({
        path: "window.__NUXT__",
        framework: "nuxt",
        keys: Object.keys(win.__NUXT__),
        shape: "object",
      });
    }

    // Redux DevTools
    if (win.__REDUX_STATE__ && typeof win.__REDUX_STATE__ === "object") {
      layers.push({
        path: "window.__REDUX_STATE__",
        framework: "redux",
        keys: Object.keys(win.__REDUX_STATE__),
        shape: "object",
      });
    }

    // Also check for Redux store on common patterns
    if (
      win.__REDUX_STORE__ &&
      typeof win.__REDUX_STORE__ === "object" &&
      typeof (win.__REDUX_STORE__ as Record<string, unknown>).getState ===
        "function"
    ) {
      layers.push({
        path: "window.__REDUX_STORE__",
        framework: "redux",
        keys: ["getState", "dispatch", "subscribe"],
        shape: "object",
      });
    }

    return layers;
  }) as Promise<DataLayerEntry[]>;
}

// ─── Event Handlers ────────────────────────────────────────────────────────────

/**
 * Find DOM elements with inline event handler attributes.
 */
async function extractEventHandlers(
  page: EvaluatablePage,
): Promise<EventHandlerEntry[]> {
  return page.evaluate(() => {
    const handlers: Array<{
      selector: string;
      event: string;
      handlerCode: string;
      elementText?: string;
    }> = [];

    const eventAttrs = [
      "onclick",
      "onsubmit",
      "onchange",
      "oninput",
      "onfocus",
      "onblur",
      "onkeydown",
      "onkeyup",
    ];

    for (const attr of eventAttrs) {
      const elements = document.querySelectorAll(`[${attr}]`);
      for (const el of elements) {
        const code = el.getAttribute(attr);
        if (!code) continue;

        // Build a reasonable selector
        let selector: string;
        if (el.id) {
          selector = `#${el.id}`;
        } else if (el.getAttribute("name")) {
          selector = `${el.tagName.toLowerCase()}[name="${el.getAttribute("name")}"]`;
        } else {
          selector = `${el.tagName.toLowerCase()}[${attr}]`;
        }

        handlers.push({
          selector,
          event: attr.replace("on", ""),
          handlerCode: code.slice(0, 200),
          elementText: el.textContent?.trim().slice(0, 100) || undefined,
        });
      }
    }

    return handlers.slice(0, 30);
  }) as Promise<EventHandlerEntry[]>;
}

// ─── Exposed APIs ──────────────────────────────────────────────────────────────

/**
 * Detect commonly exposed API objects (SDK-style interfaces).
 */
async function extractExposedAPIs(
  page: EvaluatablePage,
): Promise<ExposedAPIEntry[]> {
  return page.evaluate(() => {
    const apis: Array<{
      path: string;
      methods: Array<{ name: string; params?: string[] }>;
    }> = [];

    // Common API-like property names
    const apiPatterns = [
      "api",
      "API",
      "sdk",
      "SDK",
      "client",
      "Client",
      "service",
      "Service",
      "app",
      "App",
      "store",
      "Store",
    ];

    const win = window as unknown as Record<string, unknown>;

    for (const pattern of apiPatterns) {
      try {
        const val = win[pattern];
        if (!val || typeof val !== "object") continue;

        const methods: Array<{ name: string; params?: string[] }> = [];
        const props = Object.getOwnPropertyNames(val);

        for (const prop of props) {
          try {
            if (typeof (val as Record<string, unknown>)[prop] === "function") {
              const fnStr = (
                (val as Record<string, unknown>)[prop] as Function
              )
                .toString()
                .slice(0, 200);
              const paramMatch = fnStr.match(/\(([^)]*)\)/);
              const params = paramMatch?.[1]
                ?.split(",")
                .map((p: string) => p.trim())
                .filter(Boolean);

              methods.push({
                name: prop,
                params: params?.length ? params : undefined,
              });
            }
          } catch {
            // Skip inaccessible methods
          }
        }

        if (methods.length > 0) {
          apis.push({
            path: `window.${pattern}`,
            methods: methods.slice(0, 20),
          });
        }
      } catch {
        // Skip inaccessible properties
      }
    }

    return apis;
  }) as Promise<ExposedAPIEntry[]>;
}
