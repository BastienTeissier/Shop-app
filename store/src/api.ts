import type { CartSummary } from "@shared/types.js";

export type CartSummaryApiResponse = CartSummary & { notFound: boolean };

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
