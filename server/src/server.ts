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
	);

export default server;
export type AppType = typeof server;
