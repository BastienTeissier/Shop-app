import { z } from "zod";

import { successResponse } from "./utils.js";

const APP_BASE_URL = process.env.APP_BASE_URL ?? "";

export const productRecommendationsOptions = {
	description: "AI-powered product recommendations with A2UI streaming",
	_meta: {
		ui: {
			csp: {
				resourceDomains: ["https://fakestoreapi.com"],
				...(APP_BASE_URL ? { connectDomains: [APP_BASE_URL] } : {}),
			},
		},
	},
};

export const productRecommendationsToolOptions = {
	description:
		"Display personalized product recommendations based on user query. Uses real-time streaming for progressive updates.",
	inputSchema: {
		query: z
			.string()
			.optional()
			.describe("Initial search query for product recommendations"),
	},
};

export async function productRecommendationsHandler({
	query,
}: {
	query?: string;
}) {
	// Generate a session ID for the A2UI connection
	const sessionId = crypto.randomUUID();

	// Return the session info - the widget will connect to the SSE endpoint
	return successResponse({
		sessionId,
		initialQuery: query ?? "",
		streamEndpoint: `${APP_BASE_URL}/api/a2ui/stream`,
		eventEndpoint: `${APP_BASE_URL}/api/a2ui/event`,
	});
}
