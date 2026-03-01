#!/usr/bin/env node

import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = join(__dirname, "..", "screenshots");
const STORYBOOK_URL = process.env.STORYBOOK_URL || "http://localhost:6006";

const VIEWPORTS = {
	mobile: { width: 375, height: 667 },
	tablet: { width: 768, height: 1024 },
	desktop: { width: 1280, height: 720 },
};

const args = process.argv.slice(2);

function printUsage() {
	console.log(`Usage:
  node scripts/verify-design.mjs --list                  List all story IDs
  node scripts/verify-design.mjs <story-id>              Capture single story (desktop)
  node scripts/verify-design.mjs --all                   Capture all stories
  node scripts/verify-design.mjs <id> --viewports mobile,desktop  Capture at multiple viewports

Options:
  --list                 List available story IDs
  --all                  Capture all stories
  --viewports <list>     Comma-separated viewports: mobile, tablet, desktop (default: desktop)`);
}

async function fetchStoryIds() {
	const res = await fetch(`${STORYBOOK_URL}/index.json`);
	if (!res.ok) {
		throw new Error(
			`Failed to fetch stories from ${STORYBOOK_URL}/index.json (${res.status}). Is Storybook running?`,
		);
	}
	const data = await res.json();
	return Object.values(data.entries || data.stories || {})
		.filter((entry) => entry.type === "story")
		.map((entry) => entry.id);
}

function parseViewports(viewportArg) {
	if (!viewportArg) return [{ name: "desktop", ...VIEWPORTS.desktop }];
	return viewportArg.split(",").map((v) => {
		const name = v.trim().toLowerCase();
		const dims = VIEWPORTS[name];
		if (!dims) {
			console.error(`Unknown viewport: ${name}. Available: ${Object.keys(VIEWPORTS).join(", ")}`);
			process.exit(1);
		}
		return { name, ...dims };
	});
}

async function captureStory(storyId, viewports) {
	const { chromium } = await import("playwright");
	const browser = await chromium.launch();

	try {
		for (const vp of viewports) {
			const page = await browser.newPage({
				viewport: { width: vp.width, height: vp.height },
			});

			const url = `${STORYBOOK_URL}/iframe.html?id=${encodeURIComponent(storyId)}&viewMode=story`;
			await page.goto(url, { waitUntil: "networkidle" });

			// Wait a bit for any async rendering
			await page.waitForTimeout(500);

			if (!existsSync(SCREENSHOTS_DIR)) {
				mkdirSync(SCREENSHOTS_DIR, { recursive: true });
			}

			const filename = `${storyId}--${vp.name}.png`;
			const filepath = join(SCREENSHOTS_DIR, filename);
			await page.screenshot({ path: filepath, fullPage: true });
			console.log(`  Captured: ${filename}`);

			await page.close();
		}
	} finally {
		await browser.close();
	}
}

async function main() {
	if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
		printUsage();
		process.exit(0);
	}

	// --list: print all story IDs
	if (args.includes("--list")) {
		const ids = await fetchStoryIds();
		console.log("Available stories:");
		for (const id of ids) {
			console.log(`  ${id}`);
		}
		return;
	}

	// Parse --viewports flag
	const vpIndex = args.indexOf("--viewports");
	const viewports = vpIndex !== -1 ? parseViewports(args[vpIndex + 1]) : parseViewports(null);

	// --all: capture every story
	if (args.includes("--all")) {
		const ids = await fetchStoryIds();
		console.log(`Capturing ${ids.length} stories...`);
		for (const id of ids) {
			await captureStory(id, viewports);
		}
		console.log("Done.");
		return;
	}

	// Single story ID
	const storyId = args.find((a) => !a.startsWith("--"));
	if (!storyId) {
		console.error("Error: provide a story ID or --all");
		printUsage();
		process.exit(1);
	}

	await captureStory(storyId, viewports);
	console.log("Done.");
}

main().catch((err) => {
	console.error(err.message);
	process.exit(1);
});
