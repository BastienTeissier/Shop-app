import type { CartSnapshot } from "@shared/types.js";
import { z } from "zod";

export const textContent = (text: string) => [{ type: "text" as const, text }];

const cartSessionSchema = z.string().uuid();

export type CartSessionValidation =
	| { valid: true; sessionId: string }
	| { valid: false };

export function validateCartSession(sessionId: string): CartSessionValidation {
	const result = cartSessionSchema.safeParse(sessionId);
	return result.success ? { valid: true, sessionId } : { valid: false };
}

export const emptyCartSnapshot: CartSnapshot = {
	items: [],
	totalQuantity: 0,
	totalPrice: 0,
};
