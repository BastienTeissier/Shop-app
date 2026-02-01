import type { CartSnapshot } from "@shared/types.js";
import { z } from "zod";

// ============================================================================
// Error Messages
// ============================================================================

export const ERRORS = {
	INVALID_CART_SESSION: "Invalid cart session",
} as const;

// ============================================================================
// Response Builders
// ============================================================================

export const textContent = (text: string) => [{ type: "text" as const, text }];

/**
 * Build a successful MCP response with structured content and text fallback.
 */
export function successResponse<T>(data: T) {
	return {
		structuredContent: data,
		content: textContent(JSON.stringify(data)),
		isError: false,
	};
}

/**
 * Build an error MCP response with optional structured content.
 */
export function errorResponse<T = undefined>(message: string, data?: T) {
	return {
		structuredContent: data,
		content: textContent(message),
		isError: true,
	};
}

// ============================================================================
// Validation
// ============================================================================

const cartSessionSchema = z.string().uuid();

export type CartSessionValidation =
	| { valid: true; sessionId: string }
	| { valid: false };

export function validateCartSession(sessionId: string): CartSessionValidation {
	const result = cartSessionSchema.safeParse(sessionId);
	return result.success ? { valid: true, sessionId } : { valid: false };
}

// ============================================================================
// Empty State Constants
// ============================================================================

export const emptyCartSnapshot: CartSnapshot = {
	items: [],
	totalQuantity: 0,
	totalPrice: 0,
};
