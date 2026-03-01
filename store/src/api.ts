import type {
	CartSummaryApiResponse,
	CreateOrderResponse,
	OrderApiResponse,
} from "@shared/types.js";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

export async function fetchCartSummary(
	sessionId: string,
): Promise<CartSummaryApiResponse> {
	const res = await fetch(
		`${API_BASE}/api/cart/${encodeURIComponent(sessionId)}/summary`,
	);
	if (!res.ok) {
		throw new Error(`Failed to fetch cart summary (${res.status})`);
	}
	return res.json();
}

export async function addCartItem(
	sessionId: string,
	productId: number,
): Promise<CartSummaryApiResponse> {
	const res = await fetch(
		`${API_BASE}/api/cart/${encodeURIComponent(sessionId)}/items`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ productId }),
		},
	);
	if (!res.ok) {
		throw new Error(`Failed to add cart item (${res.status})`);
	}
	return res.json();
}

export async function updateCartItemQuantity(
	sessionId: string,
	productId: number,
	quantity: number,
): Promise<CartSummaryApiResponse> {
	const res = await fetch(
		`${API_BASE}/api/cart/${encodeURIComponent(sessionId)}/items/${productId}`,
		{
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ quantity }),
		},
	);
	if (!res.ok) {
		throw new Error(`Failed to update cart item (${res.status})`);
	}
	return res.json();
}

export async function removeCartItem(
	sessionId: string,
	productId: number,
): Promise<CartSummaryApiResponse> {
	const res = await fetch(
		`${API_BASE}/api/cart/${encodeURIComponent(sessionId)}/items/${productId}`,
		{
			method: "DELETE",
		},
	);
	if (!res.ok) {
		throw new Error(`Failed to remove cart item (${res.status})`);
	}
	return res.json();
}

export async function submitOrder(
	sessionId: string,
	customerName: string,
	customerEmail: string,
): Promise<{ reference: string }> {
	const res = await fetch(`${API_BASE}/api/orders`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ sessionId, customerName, customerEmail }),
	});
	if (!res.ok) {
		throw new Error(`Failed to submit order (${res.status})`);
	}
	const data: CreateOrderResponse = await res.json();
	if (!data.ok) {
		throw new Error(data.error);
	}
	return { reference: data.reference };
}

export async function fetchOrder(reference: string): Promise<OrderApiResponse> {
	const res = await fetch(
		`${API_BASE}/api/orders/${encodeURIComponent(reference)}`,
	);
	if (!res.ok) {
		throw new Error(`Failed to fetch order (${res.status})`);
	}
	return res.json();
}
