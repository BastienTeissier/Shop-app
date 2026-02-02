import {
	cartAddItem,
	cartCreate,
	cartGetBySessionId,
	cartGetSnapshot,
} from "../../db/cart.js";
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

	// Get cart
	const cart = await cartGetBySessionId(cartSessionId);
	if (!cart) {
		// Cart was not created, create it now
		await cartCreate(cartSessionId);
		const newCart = await cartGetBySessionId(cartSessionId);
		if (!newCart) {
			throw new Error("Failed to create cart");
		}
		await cartAddItem(newCart.id, productId);
		const snapshot = await cartGetSnapshot(newCart.id);
		broadcastCartUpdate(sessionId, snapshot);
		return;
	}

	// Add item to cart
	await cartAddItem(cart.id, productId);

	// Get updated cart snapshot
	const snapshot = await cartGetSnapshot(cart.id);

	// Broadcast cart update
	broadcastCartUpdate(sessionId, snapshot);
}

/**
 * Broadcast cart state update.
 */
function broadcastCartUpdate(
	sessionId: string,
	snapshot: { items: unknown[]; totalQuantity: number; totalPrice: number },
): void {
	broadcastDataModelUpdate(sessionId, "/cart", {
		items: snapshot.items,
		totalQuantity: snapshot.totalQuantity,
		totalPrice: snapshot.totalPrice,
	});
}
