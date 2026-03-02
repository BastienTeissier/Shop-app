import type { Request, Response } from "express";

import {
	addClient,
	broadcastDataModelUpdate,
	getOrCreateSession,
	removeClient,
	sendMessage,
} from "./session.js";
import { getRecommendationSurface, SURFACE_ID } from "./surface.js";

/**
 * SSE endpoint for A2UI streaming.
 * Clients connect to receive real-time UI updates.
 *
 * Query params:
 * - session: Session ID (optional, will be created if not provided)
 * - query: Initial search query (optional)
 */
export function a2uiStreamHandler(req: Request, res: Response): void {
	const sessionId = (req.query.session as string) || crypto.randomUUID();
	const initialQuery = (req.query.query as string) || "";

	// Use "popular products" if query is empty
	const queryToUse = initialQuery.trim() || "popular products";

	// Set SSE headers
	res.setHeader("Content-Type", "text/event-stream");
	res.setHeader("Cache-Control", "no-cache");
	res.setHeader("Connection", "keep-alive");
	res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
	res.flushHeaders();

	// Get or create session
	const session = getOrCreateSession(sessionId);

	// Update query in data model
	session.dataModel.query = queryToUse;
	session.dataModel.ui.query = queryToUse;

	// Register this client
	addClient(sessionId, res);

	// Send initial render sequence
	sendInitialRender(res, session.dataModel);

	// Auto-trigger search with the query
	void (async () => {
		const { handleRecommend } = await import("./handlers/recommend.js");
		await handleRecommend(sessionId, queryToUse);
	})().catch((error) => {
		console.error("Auto-search failed:", error);
		broadcastDataModelUpdate(sessionId, "/status", {
			phase: "error",
			message: "Failed to load recommendations. Please try again.",
		});
	});

	// Send keepalive every 30 seconds to prevent connection timeout
	const keepalive = setInterval(() => {
		res.write(": keepalive\n\n");
	}, 30000);

	// Handle client disconnect
	req.on("close", () => {
		removeClient(sessionId, res);
		clearInterval(keepalive);
	});
}

/**
 * Sends the initial A2UI render sequence to a newly connected client.
 */
function sendInitialRender(client: Response, dataModel: unknown): void {
	// 1. Begin rendering
	sendMessage(client, { type: "beginRendering" });

	// 2. Send surface structure
	sendMessage(client, {
		type: "surfaceUpdate",
		surfaceId: SURFACE_ID,
		components: getRecommendationSurface(),
	});

	// 3. Send full data model
	sendMessage(client, {
		type: "dataModelUpdate",
		surfaceId: SURFACE_ID,
		path: "/",
		value: dataModel,
	});

	// 4. End rendering
	sendMessage(client, { type: "endRendering" });
}
