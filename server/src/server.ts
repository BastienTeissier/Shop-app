import { McpServer } from "skybridge/server";

import {
	cartHandler,
	cartOptions,
	cartSummaryHandler,
	cartSummaryOptions,
	cartSummaryToolOptions,
	cartToolOptions,
	ecomCarouselHandler,
	ecomCarouselOptions,
	ecomCarouselToolOptions,
	productRecommendationsHandler,
	productRecommendationsOptions,
	productRecommendationsToolOptions,
} from "./tools/index.js";

const server = new McpServer(
	{
		name: "ecom-carousel-app",
		version: "0.0.1",
	},
	{ capabilities: {} },
)
	.registerWidget(
		"ecom-carousel",
		ecomCarouselOptions,
		ecomCarouselToolOptions,
		ecomCarouselHandler,
	)
	.registerWidget("cart", cartOptions, cartToolOptions, cartHandler)
	.registerWidget(
		"cart-summary",
		cartSummaryOptions,
		cartSummaryToolOptions,
		cartSummaryHandler,
	)
	.registerWidget(
		"product-recommendations",
		productRecommendationsOptions,
		productRecommendationsToolOptions,
		productRecommendationsHandler,
	);

export default server;
export type AppType = typeof server;
