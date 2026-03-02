import type {
	CartSummaryApiResponse,
	CreateCartResponse,
	CreateOrderResponse,
	OrderApiResponse,
	ProductApiResponse,
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

export async function createCart(): Promise<CreateCartResponse> {
	const res = await fetch(`${API_BASE}/api/cart`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
	});
	if (!res.ok) {
		throw new Error(`Failed to create cart (${res.status})`);
	}
	return res.json();
}

export async function fetchProduct(
	id: number,
): Promise<ProductApiResponse> {
	const res = await fetch(`${API_BASE}/api/products/${id}`);
	if (!res.ok && res.status !== 404 && res.status !== 400) {
		throw new Error(`Failed to fetch product (${res.status})`);
	}
	return res.json();
}

export function getA2UIStreamUrl(
	sessionId: string,
	query?: string,
): string {
	const url = new URL(`${API_BASE}/api/a2ui/stream`);
	url.searchParams.set("session", sessionId);
	if (query) {
		url.searchParams.set("query", query);
	}
	return url.toString();
}

export async function postA2UIEvent(
	sessionId: string,
	action: string,
	payload: Record<string, unknown>,
): Promise<void> {
	const res = await fetch(`${API_BASE}/api/a2ui/event`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ sessionId, action, payload }),
	});
	if (!res.ok) {
		throw new Error(`Failed to post A2UI event (${res.status})`);
	}
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
