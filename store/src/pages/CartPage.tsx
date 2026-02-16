import type { CartSummary } from "@shared/types.js";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchCartSummary } from "../api";

const formatPrice = (priceCents: number) => `$${(priceCents / 100).toFixed(2)}`;

type State =
	| { status: "loading" }
	| { status: "notFound" }
	| { status: "empty" }
	| { status: "loaded"; data: CartSummary }
	| { status: "error" };

export function CartPage() {
	const [searchParams] = useSearchParams();
	const sessionId = searchParams.get("session");
	const [state, setState] = useState<State>(
		sessionId ? { status: "loading" } : { status: "notFound" },
	);

	useEffect(() => {
		if (!sessionId) return;

		fetchCartSummary(sessionId)
			.then((summary) => {
				if (summary.notFound) {
					setState({ status: "notFound" });
				} else if (summary.items.length === 0) {
					setState({ status: "empty" });
				} else {
					setState({ status: "loaded", data: summary });
				}
			})
			.catch(() => {
				setState({ status: "error" });
			});
	}, [sessionId]);

	return (
		<div className="page-container">
			<h1 className="page-title">Your Cart</h1>
			{state.status === "loading" && (
				<div className="loading-spinner">Loading...</div>
			)}
			{state.status === "notFound" && (
				<div className="message">
					<p>Cart not found</p>
				</div>
			)}
			{state.status === "error" && (
				<div className="message">
					<p>Something went wrong. Please try again later.</p>
				</div>
			)}
			{state.status === "empty" && (
				<div className="message">
					<p>Your cart is empty</p>
				</div>
			)}
			{state.status === "loaded" && (
				<>
					<div className="summary-list">
						{state.data.items.map((item) => (
							<div key={item.productId} className="summary-item">
								<img
									src={item.imageUrl}
									alt={item.title}
									className="summary-item-image"
								/>
								<div className="summary-item-info">
									<div className="summary-item-title">{item.title}</div>
									<div className="summary-item-price">
										{formatPrice(item.unitPriceSnapshot)}
										{item.quantity > 1 && ` × ${item.quantity}`}
									</div>
								</div>
								<div className="summary-item-total">
									{formatPrice(item.lineTotal)}
								</div>
							</div>
						))}
					</div>
					<div className="summary-subtotal">
						<span>Subtotal</span>
						<span>{formatPrice(state.data.subtotal)}</span>
					</div>
				</>
			)}
		</div>
	);
}
