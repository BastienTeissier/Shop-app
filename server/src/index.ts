import express, { type Express } from "express";
import { widgetsDevServer } from "skybridge/server";
import type { ViteDevServer } from "vite";
import { a2uiEventHandler, a2uiStreamHandler } from "./a2ui/index.js";
import { cartSummaryApiHandler } from "./api/cart.js";
import { mcp } from "./middleware.js";
import server from "./server.js";

const app = express() as Express & { vite: ViteDevServer };

app.use(express.json());

app.use((req, res, next) => {
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type");

	if (req.method === "OPTIONS") {
		res.sendStatus(204);
		return;
	}

	next();
});

// A2UI endpoints for streaming recommendations
app.get("/api/a2ui/stream", a2uiStreamHandler);
app.post("/api/a2ui/event", a2uiEventHandler);

// Cart REST endpoint for standalone storefront
app.get("/api/cart/:sessionId/summary", cartSummaryApiHandler);

app.use(mcp(server));

const env = process.env.NODE_ENV || "development";

if (env !== "production") {
	const { devtoolsStaticServer } = await import("@skybridge/devtools");
	app.use(await devtoolsStaticServer());
	app.use(await widgetsDevServer());
}

app.listen(3000, (error) => {
	if (error) {
		console.error("Failed to start server:", error);
		process.exit(1);
	}
});

process.on("SIGINT", async () => {
	console.log("Server shutdown complete");
	process.exit(0);
});
