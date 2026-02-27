/**
 * CLI entry point for webmcp-extend.
 *
 * Usage:
 *   npx webmcp-extend scan <url> --scenario "..." [--steps <json>] [--output <file>]
 *   npx webmcp-extend generate <analysis.json> --tools <proposals.json> [--output-dir <dir>]
 *   npx webmcp-extend build <extension-dir>
 *   npx webmcp-extend export <extension-dir> [--output-dir <dir>]
 *   npx webmcp-extend session start <url> [--goal "..."] [--session-dir <dir>]
 *   npx webmcp-extend session step --action <type> --selector <sel> [--value <val>] [--tool-name <name>]
 *   npx webmcp-extend session screenshot
 *   npx webmcp-extend session close
 */
import { Command } from "commander";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

import { crawlSite } from "./analysis/crawl.js";
import { extractDOM } from "./analysis/extract-dom.js";
import { extractJS } from "./analysis/extract-js.js";
import { buildToolProposalPrompt } from "./analysis/propose-tools.js";
import { generateToolFiles } from "./generator/generate-tools.js";
import { generateToolManifest } from "./generator/generate-manifest.js";
import { generateExtension } from "./generator/generate-extension.js";
import { exportToKit } from "./generator/export-to-kit.js";
import {
  sessionStart,
  sessionStep,
  sessionScreenshot,
  sessionClose,
} from "./session/session.js";
import { convertSessionToolsToProposals } from "./session/convert.js";
import type {
  ScenarioStep,
  SiteAnalysis,
  ToolProposal,
} from "./analysis/types.js";
import type { ToolFromActions } from "./session/types.js";

const program = new Command();

program
  .name("webmcp-extend")
  .description("Autopilot WebMCP tools onto any website. Then build it for real.")
  .version("0.1.0");

// ─── scan ──────────────────────────────────────────────────────────────────────

program
  .command("scan")
  .description("Crawl a website and analyze its DOM + JS surface")
  .argument("<url>", "URL to scan")
  .option("-s, --scenario <description>", "Scenario description for context")
  .option("--steps <json>", "JSON array of scenario steps to execute")
  .option("-o, --output <file>", "Output file path (default: stdout)")
  .option("--no-screenshots", "Disable screenshot capture")
  .option("--headful", "Run browser in headful mode")
  .action(async (url: string, opts: {
    scenario?: string;
    steps?: string;
    output?: string;
    screenshots?: boolean;
    headful?: boolean;
  }) => {
    try {
      console.error(`🔍 Scanning ${url}...`);

      // Parse scenario steps if provided
      let steps: ScenarioStep[] = [];
      if (opts.steps) {
        try {
          steps = JSON.parse(opts.steps) as ScenarioStep[];
        } catch {
          console.error("❌ Invalid JSON for --steps");
          process.exit(1);
        }
      }

      // Crawl the site
      console.error("  📷 Crawling pages...");
      const snapshots = await crawlSite(url, steps, {
        headless: !opts.headful,
        screenshots: opts.screenshots !== false,
      });
      console.error(`  ✅ Captured ${snapshots.length} page snapshot(s)`);

      // Extract DOM for each snapshot
      console.error("  🏗️  Extracting DOM structure...");
      const domAnalyses = snapshots.map((s) => extractDOM(s));

      // Extract JS surface using Playwright (need a live page)
      console.error("  ⚡ Extracting JS surface...");
      // For JS extraction, we need a live page context — re-open for each unique URL
      const uniqueUrls = [...new Set(snapshots.map((s) => s.url))];
      const { chromium } = await import("playwright");
      const browser = await chromium.launch({ headless: !opts.headful });
      const jsAnalyses = [];

      for (const pageUrl of uniqueUrls) {
        const page = await browser.newPage();
        await page.goto(pageUrl, { waitUntil: "networkidle" });
        const jsAnalysis = await extractJS(page);
        jsAnalyses.push(jsAnalysis);
        await page.close();
      }
      await browser.close();

      // Build the analysis result
      const analysis: SiteAnalysis = {
        targetUrl: url,
        scenario: opts.scenario,
        snapshots: snapshots.map((s) => ({
          ...s,
          // Trim screenshots from JSON output to keep it manageable
          screenshot: s.screenshot ? { ...s.screenshot, data: "[base64 data omitted]" } : undefined,
        })),
        domAnalyses,
        jsAnalyses,
        proposalPrompt: "", // Will be generated next
        timestamp: Date.now(),
      };

      // Build the proposal prompt
      analysis.proposalPrompt = buildToolProposalPrompt(analysis);

      // Output
      const json = JSON.stringify(analysis, null, 2);
      if (opts.output) {
        writeFileSync(resolve(opts.output), json, "utf-8");
        console.error(`\n📄 Analysis written to ${opts.output}`);
      } else {
        console.log(json);
      }

      console.error("\n🎯 Next step: Review the proposal prompt and run `webmcp-extend generate`");
      console.error("   The proposalPrompt field contains a structured prompt for tool proposal generation.");

    } catch (error) {
      console.error(`❌ Scan failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

// ─── generate ──────────────────────────────────────────────────────────────────

program
  .command("generate")
  .description("Generate a Chrome Extension from tool proposals")
  .argument("<analysis>", "Path to scan analysis JSON file")
  .option("-t, --tools <file>", "Path to tool proposals JSON file")
  .option("--session-tools <file>", "Path to session tools.json (from interactive session)")
  .option("-o, --output-dir <dir>", "Output directory", "./webmcp-extension")
  .option("-n, --name <name>", "Extension name")
  .action(async (analysisPath: string, opts: {
    tools?: string;
    sessionTools?: string;
    outputDir: string;
    name?: string;
  }) => {
    try {
      if (!opts.tools && !opts.sessionTools) {
        console.error("❌ Either --tools or --session-tools is required");
        process.exit(1);
      }

      console.error("🛠️  Generating extension...");

      // Read inputs
      const analysis = JSON.parse(
        readFileSync(resolve(analysisPath), "utf-8"),
      ) as SiteAnalysis;

      let proposals: ToolProposal[];
      if (opts.sessionTools) {
        // Convert session tools to proposals
        const sessionTools = JSON.parse(
          readFileSync(resolve(opts.sessionTools), "utf-8"),
        ) as ToolFromActions[];
        proposals = convertSessionToolsToProposals(sessionTools);
        console.error(`  🔄 Converted ${sessionTools.length} session tool(s) to proposals`);
      } else {
        proposals = JSON.parse(
          readFileSync(resolve(opts.tools!), "utf-8"),
        ) as ToolProposal[];
      }

      console.error(`  📦 ${proposals.length} tool(s) to generate`);

      // Generate tool files
      const toolFiles = generateToolFiles(proposals);
      console.error(`  📝 Generated ${toolFiles.length} tool file(s)`);

      // Generate manifest
      const defaultPattern = new URL(analysis.targetUrl).origin + "/*";
      const manifest = generateToolManifest(proposals, {
        extensionName: opts.name ?? `webmcp-${new URL(analysis.targetUrl).hostname}`,
        defaultPattern,
      });

      // Generate extension
      const outputDir = resolve(opts.outputDir);
      generateExtension(manifest, toolFiles, proposals, outputDir, {
        name: opts.name,
      });

      console.error(`\n✅ Extension generated at ${outputDir}`);
      console.error("\n🎯 Next steps:");
      console.error(`   1. cd ${opts.outputDir} && npm install`);
      console.error(`   2. npm run build (or: npx webmcp-extend build ${opts.outputDir})`);
      console.error("   3. Load unpacked extension from dist/ in chrome://extensions");

    } catch (error) {
      console.error(`❌ Generate failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

// ─── build ─────────────────────────────────────────────────────────────────────

program
  .command("build")
  .description("Bundle a generated extension with Vite")
  .argument("<dir>", "Extension directory to build")
  .action(async (dir: string) => {
    try {
      const extensionDir = resolve(dir);
      console.error(`🔨 Building extension at ${extensionDir}...`);

      // Dynamic import vite to bundle the extension
      const { build } = await import("vite");

      const viteConfigPath = join(extensionDir, "vite.config.ts");
      await build({
        configFile: viteConfigPath,
        root: extensionDir,
      });

      console.error(`\n✅ Extension built! Load from ${join(extensionDir, "dist")} in chrome://extensions`);

    } catch (error) {
      console.error(`❌ Build failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

// ─── export ────────────────────────────────────────────────────────────────────

program
  .command("export")
  .description("Convert generated tools to clean webmcp-kit starter code")
  .argument("<dir>", "Extension directory with generated tools")
  .option("-o, --output-dir <dir>", "Output directory", "./webmcp-kit-starter")
  .action(async (dir: string, opts: { outputDir: string }) => {
    try {
      const extensionDir = resolve(dir);
      const outputDir = resolve(opts.outputDir);
      console.error(`📦 Exporting tools from ${extensionDir} to webmcp-kit format...`);

      // Read all tool files from the extension's tools/ directory
      const toolsDir = join(extensionDir, "tools");
      const toolFileNames = readdirSync(toolsDir).filter(
        (f) => f.endsWith(".ts") && f !== "index.ts",
      );

      const toolFiles = toolFileNames.map((f) => ({
        path: `tools/${f}`,
        content: readFileSync(join(toolsDir, f), "utf-8"),
      }));

      console.error(`  📄 Found ${toolFiles.length} tool file(s)`);

      // Convert to kit starter code
      const kitFiles = exportToKit(toolFiles);

      // Write output
      mkdirSync(outputDir, { recursive: true });
      for (const file of kitFiles) {
        const filePath = join(outputDir, file.path);
        mkdirSync(join(filePath, ".."), { recursive: true });
        writeFileSync(filePath, file.content, "utf-8");
      }

      console.error(`\n✅ Exported ${kitFiles.length} file(s) to ${outputDir}`);
      console.error("\n🎯 Next steps:");
      console.error("   1. Review the generated files and replace TODO comments with your app's logic");
      console.error("   2. Install webmcp-kit: npm install webmcp-kit zod");
      console.error("   3. Import and register tools in your app");
      console.error("   4. See https://github.com/victorhuangwq/webmcp-kit for docs");

    } catch (error) {
      console.error(`❌ Export failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

// ─── session ───────────────────────────────────────────────────────────────────

const session = program
  .command("session")
  .description("Interactive browser session for agent-driven exploration");

session
  .command("start")
  .description("Start a new browser session and navigate to a URL")
  .argument("<url>", "URL to open")
  .option("-g, --goal <description>", "Goal description for the exploration")
  .option("-d, --session-dir <dir>", "Session directory", "./session")
  .option("--headful", "Run browser in headful mode")
  .action(async (url: string, opts: {
    goal?: string;
    sessionDir: string;
    headful?: boolean;
  }) => {
    try {
      console.error(`🚀 Starting session for ${url}...`);
      const result = await sessionStart(url, resolve(opts.sessionDir), {
        goal: opts.goal,
        headful: opts.headful,
      });
      console.error(`✅ Session started in ${result.sessionDir}`);
      console.error(`📸 Screenshot: ${result.screenshotPath}`);
    } catch (error) {
      console.error(`❌ Session start failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

session
  .command("step")
  .description("Execute an action in the current session")
  .requiredOption("-a, --action <type>", "Action type (click, fill, select, hover, scroll, wait, navigate)")
  .option("-s, --selector <selector>", "CSS selector for the target element")
  .option("-v, --value <value>", "Value for fill/select actions")
  .option("-u, --url <url>", "URL for navigate action")
  .option("-t, --tool-name <name>", "Tag this step as part of a named tool")
  .option("-d, --session-dir <dir>", "Session directory", "./session")
  .action(async (opts: {
    action: string;
    selector?: string;
    value?: string;
    url?: string;
    toolName?: string;
    sessionDir: string;
  }) => {
    try {
      const result = await sessionStep(resolve(opts.sessionDir), {
        action: opts.action as any,
        selector: opts.selector,
        value: opts.value,
        url: opts.url,
        toolName: opts.toolName,
      });
      if (result.entry.success) {
        console.error(`✅ ${opts.action}${opts.selector ? ` on ${opts.selector}` : ""}${opts.toolName ? ` [tool: ${opts.toolName}]` : ""}`);
      } else {
        console.error(`❌ ${opts.action} failed: ${result.entry.error}`);
      }
      console.error(`📸 Screenshot: ${result.screenshotPath}`);
    } catch (error) {
      console.error(`❌ Step failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

session
  .command("screenshot")
  .description("Capture a screenshot of the current page")
  .option("-d, --session-dir <dir>", "Session directory", "./session")
  .action(async (opts: { sessionDir: string }) => {
    try {
      const result = await sessionScreenshot(resolve(opts.sessionDir));
      console.error(`📸 Screenshot: ${result.screenshotPath}`);
    } catch (error) {
      console.error(`❌ Screenshot failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

session
  .command("close")
  .description("Close the session and generate tool definitions from recorded actions")
  .option("-d, --session-dir <dir>", "Session directory", "./session")
  .action(async (opts: { sessionDir: string }) => {
    try {
      console.error("🔒 Closing session...");
      const result = await sessionClose(resolve(opts.sessionDir));
      console.error(`✅ Session closed. ${result.tools.length} tool(s) generated.`);
      if (result.tools.length > 0) {
        console.error(`📄 Tools written to ${result.toolsPath}`);
        console.error("\n📋 Discovered tools:");
        for (const tool of result.tools) {
          console.error(`   • ${tool.name} (${tool.steps.length} step(s))`);
        }
        console.error(`\n🎯 Next: Use tools.json with "webmcp-extend generate" to build the extension`);
      }
    } catch (error) {
      console.error(`❌ Close failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

// ─── Run ───────────────────────────────────────────────────────────────────────

program.parse();
