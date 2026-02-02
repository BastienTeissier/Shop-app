import type { A2UIComponent } from "@shared/a2ui-types.js";

// =============================================================================
// Surface Definition for Product Recommendations
// =============================================================================

export const SURFACE_ID = "product-recommendations";

/**
 * Returns the A2UI component tree for the product recommendations surface.
 * This defines the UI structure; data is bound via paths to the data model.
 */
export function getRecommendationSurface(): A2UIComponent[] {
	return [
		{
			type: "column",
			id: "root",
			className: "recommendations-container",
			children: [
				// Header with search input
				{
					type: "row",
					id: "header",
					className: "recommendations-header",
					children: [
						{
							type: "input",
							id: "search-input",
							placeholder: "Search for products...",
							action: "search",
							binding: "/ui/query",
							className: "search-input",
						},
					],
				},

				// Status banner
				{
					type: "text",
					id: "status-message",
					binding: "/status/message",
					className: "status-message",
				},

				// Product list (grouped by tier)
				{
					type: "tieredList",
					id: "product-list",
					binding: "/products",
					emptyMessage: "No products found. Try a different search.",
					className: "product-grid",
					template: [
						{
							type: "productCard",
							id: "product-card-template",
							binding: ".", // binds to current item in list iteration
						},
					],
				},

				// Refinement input
				{
					type: "refineInput",
					id: "refine-input",
					placeholder: "Refine: 'exclude jackets', 'show under $100'...",
					action: "refine",
					className: "refine-input-container",
				},

				// Cart indicator
				{
					type: "row",
					id: "cart-indicator",
					className: "cart-indicator",
					children: [
						{
							type: "text",
							id: "cart-count",
							binding: "/cart/totalQuantity",
							className: "cart-count",
						},
						{
							type: "text",
							id: "cart-total",
							binding: "/cart/totalPrice",
							className: "cart-total",
						},
					],
				},
			],
		},
	];
}
