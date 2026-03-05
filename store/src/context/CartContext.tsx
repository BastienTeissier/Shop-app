import type { CartSummary, CartSummaryApiResponse } from "@shared/types.js";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { useSearchParams } from "react-router-dom";
import {
	addCartItem,
	fetchCartSummary,
	removeCartItem,
	updateCartItemQuantity,
} from "../api.js";

export type CartContextValue = {
	cart: CartSummary | null;
	sessionId: string | null;
	loading: boolean;
	notFound: boolean;
	error: string | null;
	totalQuantity: number;
	setQuantity: (productId: number, quantity: number) => void;
	removeItem: (productId: number) => void;
	addItem: (productId: number) => void;
	clearError: () => void;
	clearCart: () => void;
};

export const CartContext = createContext<CartContextValue | null>(null);

const ERROR_DISMISS_MS = 3000;

function cartFromResponse(res: CartSummaryApiResponse): CartSummary | null {
	if (res.notFound) return null;
	return { items: res.items, subtotal: res.subtotal };
}

function sumLineTotals(items: CartSummary["items"]): number {
	return items.reduce((sum, item) => sum + item.lineTotal, 0);
}

export function CartProvider({ children }: { children: React.ReactNode }) {
	const [searchParams] = useSearchParams();
	const sessionId = searchParams.get("session");

	const [cart, setCart] = useState<CartSummary | null>(null);
	const [loading, setLoading] = useState(!!sessionId);
	const [notFound, setNotFound] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Auto-dismiss errors
	useEffect(() => {
		if (!error) return;
		const timer = setTimeout(() => setError(null), ERROR_DISMISS_MS);
		return () => clearTimeout(timer);
	}, [error]);

	// Initial fetch
	useEffect(() => {
		if (!sessionId) return;

		fetchCartSummary(sessionId)
			.then((res) => {
				if (res.notFound) {
					setNotFound(true);
					setCart(null);
				} else {
					setCart({ items: res.items, subtotal: res.subtotal });
					setNotFound(false);
				}
			})
			.catch(() => {
				setError("Failed to load cart");
				setCart(null);
				setNotFound(false);
			})
			.finally(() => setLoading(false));
	}, [sessionId]);

	const totalQuantity = useMemo(
		() => (cart ? cart.items.reduce((sum, item) => sum + item.quantity, 0) : 0),
		[cart],
	);

	const setQuantity = useCallback(
		(productId: number, quantity: number) => {
			if (!sessionId || !cart) return;

			const prevCart = cart;

			// Optimistic update
			if (quantity <= 0) {
				const newItems = cart.items.filter(
					(item) => item.productId !== productId,
				);
				setCart({ items: newItems, subtotal: sumLineTotals(newItems) });
			} else {
				const newItems = cart.items.map((item) =>
					item.productId === productId
						? {
								...item,
								quantity,
								lineTotal: item.unitPriceSnapshot * quantity,
							}
						: item,
				);
				setCart({ items: newItems, subtotal: sumLineTotals(newItems) });
			}

			updateCartItemQuantity(sessionId, productId, quantity)
				.then((res) => {
					const serverCart = cartFromResponse(res);
					if (serverCart) setCart(serverCart);
				})
				.catch(() => {
					setCart(prevCart);
					setError("Failed to update quantity");
				});
		},
		[sessionId, cart],
	);

	const removeItem = useCallback(
		(productId: number) => {
			if (!sessionId || !cart) return;

			const prevCart = cart;

			// Optimistic removal
			const newItems = cart.items.filter(
				(item) => item.productId !== productId,
			);
			setCart({ items: newItems, subtotal: sumLineTotals(newItems) });

			removeCartItem(sessionId, productId)
				.then((res) => {
					const serverCart = cartFromResponse(res);
					if (serverCart) setCart(serverCart);
				})
				.catch(() => {
					setCart(prevCart);
					setError("Failed to remove item");
				});
		},
		[sessionId, cart],
	);

	const addItem = useCallback(
		(productId: number) => {
			if (!sessionId) return;

			addCartItem(sessionId, productId)
				.then((res) => {
					const serverCart = cartFromResponse(res);
					if (serverCart) setCart(serverCart);
				})
				.catch(() => {
					setError("Failed to add item");
				});
		},
		[sessionId],
	);

	const clearError = useCallback(() => setError(null), []);

	const clearCart = useCallback(() => setCart({ items: [], subtotal: 0 }), []);

	const value = useMemo<CartContextValue>(
		() => ({
			cart,
			sessionId,
			loading,
			notFound,
			error,
			totalQuantity,
			setQuantity,
			removeItem,
			addItem,
			clearError,
			clearCart,
		}),
		[
			cart,
			sessionId,
			loading,
			notFound,
			error,
			totalQuantity,
			setQuantity,
			removeItem,
			addItem,
			clearError,
			clearCart,
		],
	);

	return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
	const ctx = useContext(CartContext);
	if (!ctx) {
		throw new Error("useCart must be used within a CartProvider");
	}
	return ctx;
}
