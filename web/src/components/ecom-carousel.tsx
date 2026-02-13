import "@/index.css";

import type { CartSnapshot, CartWidgetState, Product } from "@shared/types.js";
import { useEffect, useState } from "react";
import {
	useLayout,
	useOpenExternal,
	useRequestModal,
	useUser,
	useWidgetState,
} from "skybridge/web";
import { useCallTool, useToolInfo } from "../helpers.js";

const translations: Record<string, Record<string, string>> = {
	en: {
		loading: "Loading products...",
		noProducts: "No product found",
		addToCart: "Add to cart",
		removeFromCart: "Remove",
		cartError: "An error occur while updating your cart",
	},
	fr: {
		loading: "Chargement des produits...",
		noProducts: "Aucun produit trouvé",
		addToCart: "Ajouter",
		removeFromCart: "Retirer",
		cartError:
			"Une erreur s'est produite lors de la mise à jour de votre panier",
	},
	es: {
		loading: "Cargando productos...",
		noProducts: "No se encontraron productos",
		addToCart: "Añadir",
		removeFromCart: "Quitar",
		cartError: "Se produjo un error al actualizar tu carrito",
	},
	de: {
		loading: "Produkte werden geladen...",
		noProducts: "Keine Produkte gefunden",
		addToCart: "Hinzufügen",
		removeFromCart: "Entfernen",
		cartError: "Beim Aktualisieren Ihres Warenkorbs ist ein Fehler aufgetreten",
	},
};

const STORE_URL = import.meta.env.VITE_STORE_URL || "http://localhost:4000";
const formatPrice = (priceCents: number) => `$${(priceCents / 100).toFixed(2)}`;

export function EcomCarousel() {
	const { theme } = useLayout();
	const { locale } = useUser();
	const { open, isOpen } = useRequestModal();
	const openExternal = useOpenExternal();

	const lang = locale?.split("-")[0] ?? "en";

	function translate(key: string) {
		return translations[lang]?.[key] ?? translations.en[key];
	}

	const { output, isPending } = useToolInfo<"ecom-carousel">();
	const products = output?.products ?? [];
	const [selected, setSelected] = useState<Product | null>(null);

	const { callToolAsync } = useCallTool("cart");
	const [cart, setCart] = useWidgetState<CartWidgetState>({
		snapshot: { items: [], totalQuantity: 0, totalPrice: 0 },
	});

	const [errorBanner, setErrorBanner] = useState<string | null>(null);

	useEffect(() => {
		if (errorBanner) {
			const timer = setTimeout(() => setErrorBanner(null), 3000);
			return () => clearTimeout(timer);
		}
	}, [errorBanner]);

	async function toggleCart(productId: number) {
		if (cart.cartDisabled) {
			return;
		}

		const inCart = cart.snapshot.items.some(
			(item) => item.productId === productId,
		);
		const action = inCart ? "remove" : "add";

		// Optimistic update
		const product = products.find((p) => p.id === productId);
		const optimisticSnapshot = inCart
			? {
					items: cart.snapshot.items.filter(
						(item) => item.productId !== productId,
					),
					totalQuantity: cart.snapshot.totalQuantity - 1,
					totalPrice:
						cart.snapshot.totalPrice -
						(cart.snapshot.items.find((item) => item.productId === productId)
							?.priceSnapshot ?? 0),
				}
			: {
					items: [
						...cart.snapshot.items,
						{
							productId,
							quantity: 1,
							priceSnapshot: product?.price ?? 0,
						},
					],
					totalQuantity: cart.snapshot.totalQuantity + 1,
					totalPrice: cart.snapshot.totalPrice + (product?.price ?? 0),
				};

		setCart((prev) => ({
			...prev,
			snapshot: optimisticSnapshot,
		}));

		// Store pre-optimistic snapshot for potential rollback
		const previousSnapshot = cart.snapshot;

		try {
			const response = await callToolAsync({
				action,
				productId,
				sessionId: cart.sessionId,
			});

			if (response?.isError) {
				// Revert to previous snapshot and show error
				setErrorBanner(translate("cartError"));
				setCart((prev) => ({
					...prev,
					snapshot: previousSnapshot,
					cartDisabled: true,
					error: "Invalid cart session",
				}));
				return;
			}

			const serverSnapshot = response?.structuredContent?.cart as
				| CartSnapshot
				| undefined;
			if (serverSnapshot) {
				setCart((prev) => ({
					...prev,
					snapshot: serverSnapshot,
					sessionId: response?.structuredContent?.sessionId ?? prev.sessionId,
					cartDisabled: false,
					error: undefined,
				}));
			}
		} catch (_error) {
			// Reconciliation error: revert to previous state and show banner
			setErrorBanner(translate("cartError"));
			setCart((prev) => ({
				...prev,
				snapshot: previousSnapshot, // revert to pre-optimistic state
			}));
		}
	}

	if (isPending) {
		return (
			<div className={`${theme} container`}>
				<div className="message">{translate("loading")}</div>
			</div>
		);
	}

	if (!output || products.length === 0) {
		return (
			<div className={`${theme} container`}>
				<div className="message">{translate("noProducts")}</div>
			</div>
		);
	}

	if (isOpen) {
		const cartProductIds = cart.snapshot.items.map((item) => item.productId);
		const cartItems: Product[] = [];
		for (const p of products) {
			if (cartProductIds.includes(p.id)) {
				cartItems.push(p);
			}
		}
		const checkoutUrl = `${STORE_URL}/cart?session=${cart.sessionId}`;

		return (
			<div className={`${theme} checkout`}>
				<div className="checkout-title">Order summary</div>
				<div className="checkout-items">
					{cartItems.map((item) => {
						const cartItem = cart.snapshot.items.find(
							(ci) => ci.productId === item.id,
						);
						const itemTotal =
							(cartItem?.priceSnapshot ?? item.price) *
							(cartItem?.quantity ?? 1);
						return (
							<div key={item.id} className="checkout-item">
								<span>
									{item.title}
									{(cartItem?.quantity ?? 1) > 1 && ` (x${cartItem?.quantity})`}
								</span>
								<span>{formatPrice(itemTotal)}</span>
							</div>
						);
					})}
				</div>
				<div className="checkout-total">
					<span>Total</span>
					<span>{formatPrice(cart.snapshot.totalPrice)}</span>
				</div>
				<button
					type="button"
					className="checkout-button"
					onClick={() => openExternal(checkoutUrl)}
					disabled={cart.cartDisabled || !cart.sessionId}
				>
					Checkout
				</button>
			</div>
		);
	}

	const activeProduct = selected ?? products[0];

	return (
		<div className={`${theme} container`}>
			{errorBanner && <div className="error-banner">{errorBanner}</div>}
			<button
				type="button"
				className="cart-indicator"
				onClick={() => open({ title: "Proceed to checkout ?" })}
				disabled={cart.snapshot.totalQuantity === 0 || cart.cartDisabled}
			>
				🛒 {cart.snapshot.totalQuantity}
			</button>
			{cart.error ? <div className="message">{cart.error}</div> : null}
			<div className="carousel">
				{products.map((product) => {
					const inCart = cart.snapshot.items.some(
						(item) => item.productId === product.id,
					);
					return (
						<div key={product.id} className="product-wrapper">
							<button
								type="button"
								className={`product-card ${activeProduct?.id === product.id ? "selected" : ""}`}
								onClick={() => setSelected(product)}
							>
								<img
									src={product.imageUrl}
									alt={product.title}
									className="product-image"
								/>
								<div className="product-info">
									<div className="product-title">{product.title}</div>
									<div className="product-price">
										{formatPrice(product.price)}
									</div>
								</div>
							</button>
							<button
								type="button"
								className={`cart-button ${inCart ? "in-cart" : ""}`}
								onClick={() => toggleCart(product.id)}
								disabled={cart.cartDisabled}
							>
								{inCart ? translate("removeFromCart") : translate("addToCart")}
							</button>
						</div>
					);
				})}
			</div>
			<div className="product-detail">
				<div className="detail-title">{activeProduct.title}</div>
				<div className="detail-description">{activeProduct.description}</div>
			</div>
		</div>
	);
}

export default EcomCarousel;
