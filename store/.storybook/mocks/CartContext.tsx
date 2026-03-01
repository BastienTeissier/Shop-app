import React from "react";
import {
	CartContext,
	type CartContextValue,
} from "../../src/context/CartContext.js";

const noop = () => {};

const defaults: CartContextValue = {
	cart: null,
	sessionId: null,
	loading: false,
	notFound: false,
	error: null,
	totalQuantity: 0,
	setQuantity: noop,
	removeItem: noop,
	addItem: noop,
	clearError: noop,
	clearCart: noop,
};

export function MockCartProvider({
	children,
	...overrides
}: Partial<CartContextValue> & { children: React.ReactNode }) {
	const value: CartContextValue = { ...defaults, ...overrides };
	return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
