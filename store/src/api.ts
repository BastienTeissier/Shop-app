import type { CartSummary } from "@shared/types.js";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

export async function fetchCartSummary(
	sessionId: string,
): Promise<CartSummary> {
	const res = await fetch(`${API_BASE}/api/cart/${sessionId}/summary`);
	return res.json();
}
