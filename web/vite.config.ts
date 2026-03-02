/// <reference types="vitest" />

import react from "@vitejs/plugin-react";
import { skybridge } from "skybridge/web";
import { defineConfig } from "vite";

import path from "node:path";

// https://vite.dev/config/
export default defineConfig({
	plugins: [skybridge(), react()],
	root: __dirname,
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
			"@shared": path.resolve(__dirname, "../shared"),
		},
	},
	test: {
		environment: "happy-dom",
		setupFiles: ["./src/test/setup.ts"],
	},
});
