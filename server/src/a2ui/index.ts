// A2UI Module Barrel Exports

export { a2uiEventHandler } from "./event.js";
export {
	handleAddToCart,
	handleRecommend,
	handleSelectProduct,
} from "./handlers/index.js";
export {
	addClient,
	broadcastDataModelUpdate,
	broadcastToSession,
	createSession,
	deleteSession,
	getOrCreateSession,
	getSession,
	removeClient,
	sendMessage,
} from "./session.js";
export { a2uiStreamHandler } from "./stream.js";
export { getRecommendationSurface, SURFACE_ID } from "./surface.js";
