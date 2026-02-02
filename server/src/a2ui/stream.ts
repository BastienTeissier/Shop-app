import type { Request, Response } from "express";
import {
	addClient,
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

	// Set SSE headers
	res.setHeader("Content-Type", "text/event-stream");
	res.setHeader("Cache-Control", "no-cache");
	res.setHeader("Connection", "keep-alive");
	res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
	res.flushHeaders();

	// Get or create session
	const session = getOrCreateSession(sessionId);

	// Update initial query if provided
	if (initialQuery) {
		session.dataModel.query = initialQuery;
		session.dataModel.ui.query = initialQuery;
	}

	// Register this client
	addClient(sessionId, res);

	// Send initial render sequence
	sendInitialRender(res, sessionId, session.dataModel);

	// Handle client disconnect
	req.on("close", () => {
		removeClient(sessionId, res);
	});

	// Send keepalive every 30 seconds to prevent connection timeout
	const keepalive = setInterval(() => {
		res.write(": keepalive\n\n");
	}, 30000);

	req.on("close", () => {
		clearInterval(keepalive);
	});
}

/**
 * Sends the initial A2UI render sequence to a newly connected client.
 */
function sendInitialRender(
	client: Response,
	_sessionId: string,
	dataModel: unknown,
): void {
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
