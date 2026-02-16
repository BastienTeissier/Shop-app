import { cartAddItem, cartCreate, cartGetBySessionId } from "../../db/cart.js";
import {
	broadcastDataModelUpdate,
	getCartSessionId,
	setCartSessionId,
} from "../session.js";

/**
 * Handle product selection.
 */
export async function handleSelectProduct(
	sessionId: string,
	productId: number,
): Promise<void> {
	broadcastDataModelUpdate(sessionId, "/ui/selectedProductId", productId);
}

/**
 * Handle add to cart action.
 */
export async function handleAddToCart(
	sessionId: string,
	productId: number,
): Promise<void> {
	// Get or create cart session
	let cartSessionId = getCartSessionId(sessionId);

	if (!cartSessionId) {
		cartSessionId = crypto.randomUUID();
		setCartSessionId(sessionId, cartSessionId);
		await cartCreate(cartSessionId);
	}

	// Get cart (guaranteed to exist after cartCreate above)
	const cart = await cartGetBySessionId(cartSessionId);
	if (!cart) {
		throw new Error("Failed to create cart");
	}

	// Add item and get updated snapshot
	const snapshot = await cartAddItem(cart.id, productId);

	// Broadcast cart update
	broadcastDataModelUpdate(sessionId, "/cart", {
		items: snapshot.items,
		totalQuantity: snapshot.totalQuantity,
		totalPrice: snapshot.totalPrice,
	});
}
