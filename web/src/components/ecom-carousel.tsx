import "@/index.css";

import { useState } from "react";
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
	},
	fr: {
		loading: "Chargement des produits...",
		noProducts: "Aucun produit trouvé",
		addToCart: "Ajouter",
		removeFromCart: "Retirer",
	},
	es: {
		loading: "Cargando productos...",
		noProducts: "No se encontraron productos",
		addToCart: "Añadir",
		removeFromCart: "Quitar",
	},
	de: {
		loading: "Produkte werden geladen...",
		noProducts: "Keine Produkte gefunden",
		addToCart: "Hinzufügen",
		removeFromCart: "Entfernen",
	},
};

const CHECKOUT_URL = "https://alpic.ai";
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
	type Product = (typeof products)[number];
	const [selected, setSelected] = useState<Product | null>(null);

	const { callToolAsync } = useCallTool("cart");
	const [cart, setCart] = useWidgetState<{
		ids: number[];
		sessionId?: string;
		cartDisabled?: boolean;
		error?: string;
	}>({ ids: [] });

	async function toggleCart(productId: number) {
		if (cart.cartDisabled) {
			return;
		}

		const inCart = cart.ids.includes(productId);
		const action = inCart ? "remove" : "add";

		try {
			const response = await callToolAsync({
				action,
				productId,
				sessionId: cart.sessionId,
			});

			if (response?.isError) {
				setCart((prev) => ({
					...prev,
					cartDisabled: true,
					error: "Invalid cart session",
				}));
				return;
			}

			setCart((prev) => ({
				...prev,
				ids: inCart
					? prev.ids.filter((id) => id !== productId)
					: [...prev.ids, productId],
				sessionId: response?.structuredContent?.sessionId ?? prev.sessionId,
				cartDisabled: false,
				error: undefined,
			}));
		} catch (_error) {
			setCart((prev) => ({
				...prev,
				cartDisabled: true,
				error: "Invalid cart session",
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
		const cartItems: Product[] = [];
		let totalCents = 0;
		for (const p of products) {
			if (cart.ids.includes(p.id)) {
				cartItems.push(p);
				totalCents += p.price;
			}
		}
		const checkoutUrl = new URL(CHECKOUT_URL);
		checkoutUrl.searchParams.set("cart", cart.ids.join(","));

		return (
			<div className={`${theme} checkout`}>
				<div className="checkout-title">Order summary</div>
				<div className="checkout-items">
					{cartItems.map((item) => (
						<div key={item.id} className="checkout-item">
							<span>{item.title}</span>
							<span>{formatPrice(item.price)}</span>
						</div>
					))}
				</div>
				<div className="checkout-total">
					<span>Total</span>
					<span>{formatPrice(totalCents)}</span>
				</div>
				<button
					type="button"
					className="checkout-button"
					onClick={() => openExternal(checkoutUrl.toString())}
					disabled={cart.cartDisabled}
				>
					Checkout
				</button>
			</div>
		);
	}

	const activeProduct = selected ?? products[0];

	return (
		<div className={`${theme} container`}>
			<button
				type="button"
				className="cart-indicator"
				onClick={() => open({ title: "Proceed to checkout ?" })}
				disabled={cart.ids.length === 0 || cart.cartDisabled}
			>
				🛒 {cart.ids.length}
			</button>
			{cart.error ? <div className="message">{cart.error}</div> : null}
			<div className="carousel">
				{products.map((product) => {
					const inCart = cart.ids.includes(product.id);
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
