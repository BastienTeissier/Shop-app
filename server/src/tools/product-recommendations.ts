import { z } from "zod";
import { successResponse } from "./utils.js";

export const productRecommendationsOptions = {
	description: "AI-powered product recommendations with A2UI streaming",
	_meta: {
		ui: {
			csp: {
				resourceDomains: ["https://fakestoreapi.com"],
				connectDomains: [
					"http://localhost:3000",
					"https://5ccf-46-193-107-8.ngrok-free.app",
				], // Allow SSE connection to same origin and localhost
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
		streamEndpoint: "http://localhost:3000/api/a2ui/stream",
		eventEndpoint: "http://localhost:3000/api/a2ui/event",
	});
}
