/// <reference types="vitest" />

import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			"@shared": path.resolve(__dirname, "../shared"),
		},
	},
	server: {
		port: 4000,
	},
	test: {
		environment: "happy-dom",
		setupFiles: ["./src/test/setup.ts"],
		include: [
			"./src/**/*.{test,spec}.{ts,tsx}",
			"../shared/**/*.{test,spec}.{ts,tsx}",
		],
	},
});
