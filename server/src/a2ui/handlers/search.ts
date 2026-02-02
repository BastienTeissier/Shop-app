import { productList } from "../../db/products.js";
import { broadcastDataModelUpdate } from "../session.js";

/**
 * Handle search action - queries products and broadcasts results.
 */
export async function handleSearch(
	sessionId: string,
	query: string,
): Promise<void> {
	// Update status to searching
	broadcastDataModelUpdate(sessionId, "/status", {
		phase: "searching",
		message: `Searching for "${query}"...`,
	});

	// Update query in data model
	broadcastDataModelUpdate(sessionId, "/query", query);
	broadcastDataModelUpdate(sessionId, "/ui/query", query);

	// Query products from database
	const products = await productList(query, 20);

	// Transform to recommendation format
	const recommendations = products.map((p) => ({
		id: p.id,
		title: p.title,
		description: p.description,
		imageUrl: p.imageUrl,
		price: p.price,
		highlights: [],
		reasonWhy: [],
	}));

	// Broadcast products
	broadcastDataModelUpdate(sessionId, "/products", recommendations);

	// Update status to completed
	broadcastDataModelUpdate(sessionId, "/status", {
		phase: "completed",
		message:
			recommendations.length > 0
				? `Found ${recommendations.length} products`
				: "No products found",
	});
}
