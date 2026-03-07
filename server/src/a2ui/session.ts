import type { Response } from "express";

import type {
	A2UIMessage,
	A2UISession,
	RecommendationDataModel,
	RecommendationProduct,
} from "@shared/a2ui-types.js";

import { createInitialDataModel } from "@shared/a2ui-types.js";
import { parseSafePath } from "@shared/a2ui-utils.js";
import type { FormattedQuery } from "../agent/schemas/index.js";

export { createInitialDataModel };

// =============================================================================
// Server-only Runtime Types
// =============================================================================

export type LastRecommendation = {
	query: string;
	products: RecommendationProduct[];
};

type SessionRuntime = {
	abortController?: AbortController;
	lastRecommendation?: LastRecommendation;
	lastFormattedQuery?: FormattedQuery;
};

// =============================================================================
// Session Store
// =============================================================================

type SessionEntry = {
	session: A2UISession;
	clients: Set<Response>;
	runtime: SessionRuntime;
};

const sessions = new Map<string, SessionEntry>();

// =============================================================================
// Session Management
// =============================================================================

export function createSession(sessionId: string): A2UISession {
	const session: A2UISession = {
		sessionId,
		dataModel: createInitialDataModel(),
		createdAt: new Date(),
	};

	sessions.set(sessionId, {
		session,
		clients: new Set(),
		runtime: {},
	});

	return session;
}

export function getSession(sessionId: string): A2UISession | undefined {
	return sessions.get(sessionId)?.session;
}

export function getOrCreateSession(sessionId: string): A2UISession {
	const existing = getSession(sessionId);
	if (existing) {
		return existing;
	}
	return createSession(sessionId);
}

export function deleteSession(sessionId: string): boolean {
	return sessions.delete(sessionId);
}

// =============================================================================
// Client Management
// =============================================================================

export function addClient(sessionId: string, client: Response): void {
	const entry = sessions.get(sessionId);
	if (entry) {
		entry.clients.add(client);
	}
}

export function removeClient(sessionId: string, client: Response): void {
	const entry = sessions.get(sessionId);
	if (entry) {
		entry.clients.delete(client);
		// Clean up session if no clients remain
		if (entry.clients.size === 0) {
			sessions.delete(sessionId);
		}
	}
}

export function getClients(sessionId: string): Set<Response> {
	return sessions.get(sessionId)?.clients ?? new Set();
}

// =============================================================================
// Session TTL Cleanup
// =============================================================================

const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

function cleanupStaleSessions(): void {
	const now = Date.now();
	for (const [sessionId, entry] of sessions) {
		if (entry.clients.size === 0) {
			const age = now - entry.session.createdAt.getTime();
			if (age > SESSION_TTL_MS) {
				sessions.delete(sessionId);
			}
		}
	}
}

setInterval(cleanupStaleSessions, CLEANUP_INTERVAL_MS).unref();

// =============================================================================
// Message Broadcasting
// =============================================================================

export function sendMessage(client: Response, message: A2UIMessage): void {
	client.write(`data: ${JSON.stringify(message)}\n\n`);
}

export function broadcastToSession(
	sessionId: string,
	message: A2UIMessage,
): void {
	const clients = getClients(sessionId);
	for (const client of clients) {
		sendMessage(client, message);
	}
}

export function broadcastDataModelUpdate(
	sessionId: string,
	path: string,
	value: unknown,
): void {
	const session = getSession(sessionId);
	if (!session) return;

	// Update the session's data model
	updateDataModelAtPath(session.dataModel, path, value);

	// Broadcast the update
	broadcastToSession(sessionId, {
		type: "dataModelUpdate",
		surfaceId: "product-recommendations",
		path,
		value,
	});
}

// =============================================================================
// Data Model Updates
// =============================================================================

export function updateDataModelAtPath(
	dataModel: RecommendationDataModel,
	path: string,
	value: unknown,
): void {
	const parts = parseSafePath(path);
	if (!parts || parts.length === 0) return;

	let current: Record<string, unknown> = dataModel;
	for (let i = 0; i < parts.length - 1; i++) {
		const part = parts[i];
		if (typeof current[part] !== "object" || current[part] === null) {
			current[part] = {};
		}
		current = current[part] as Record<string, unknown>;
	}

	const lastPart = parts[parts.length - 1];
	current[lastPart] = value;
}

export function getDataModelAtPath(
	dataModel: RecommendationDataModel,
	path: string,
): unknown {
	const parts = parseSafePath(path);
	if (!parts) return undefined;
	let current: unknown = dataModel;

	for (const part of parts) {
		if (typeof current !== "object" || current === null) {
			return undefined;
		}
		current = (current as Record<string, unknown>)[part];
	}

	return current;
}

// =============================================================================
// Session State Updates
// =============================================================================

export function setCartSessionId(
	sessionId: string,
	cartSessionId: string,
): void {
	const session = getSession(sessionId);
	if (session) {
		session.cartSessionId = cartSessionId;
	}
}

export function getCartSessionId(sessionId: string): string | undefined {
	return getSession(sessionId)?.cartSessionId;
}

// =============================================================================
// Pipeline Abort
// =============================================================================

/**
 * Abort any in-flight pipeline for the given session and return a fresh AbortSignal.
 */
export function abortPreviousPipeline(sessionId: string): AbortSignal {
	const entry = sessions.get(sessionId);
	if (entry?.runtime.abortController) {
		entry.runtime.abortController.abort();
	}
	const controller = new AbortController();
	if (entry) {
		entry.runtime.abortController = controller;
	}
	return controller.signal;
}

// =============================================================================
// Last Recommendation Context (for refinement)
// =============================================================================

export function setLastRecommendation(
	sessionId: string,
	lastRecommendation: LastRecommendation | undefined,
): void {
	const entry = sessions.get(sessionId);
	if (entry) {
		entry.runtime.lastRecommendation = lastRecommendation;
	}
}

export function getLastRecommendation(
	sessionId: string,
): LastRecommendation | undefined {
	return sessions.get(sessionId)?.runtime.lastRecommendation;
}

// =============================================================================
// Last Formatted Query (for UF2/UF3)
// =============================================================================

export function setLastFormattedQuery(
	sessionId: string,
	formattedQuery: FormattedQuery | undefined,
): void {
	const entry = sessions.get(sessionId);
	if (entry) {
		entry.runtime.lastFormattedQuery = formattedQuery;
	}
}

export function getLastFormattedQuery(
	sessionId: string,
): FormattedQuery | undefined {
	return sessions.get(sessionId)?.runtime.lastFormattedQuery;
}
