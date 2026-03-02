import { formatPrice } from "@shared/format.js";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { submitOrder } from "../api.js";
import { useCart } from "../context/CartContext.js";

export function CheckoutPage() {
	const { cart, sessionId, loading, notFound, clearCart } = useCart();
	const navigate = useNavigate();

	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);

	const showEmpty =
		!loading && (!cart || cart.items.length === 0 || notFound || !sessionId);

	const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
	const formValid = name.trim().length > 0 && emailValid && !submitting;

	async function handleSubmit(e: FormEvent) {
		e.preventDefault();
		if (!sessionId || !formValid) return;

		setSubmitting(true);
		setSubmitError(null);

		try {
			const { reference } = await submitOrder(
				sessionId,
				name.trim(),
				email.trim(),
			);
			clearCart();
			navigate(`/orders/${reference}`);
		} catch {
			setSubmitError("Something went wrong. Please try again.");
			setSubmitting(false);
		}
	}

	return (
		<div className="page-container">
			<h1 className="page-title">Checkout</h1>

			{loading && <div className="loading-spinner">Loading...</div>}

			{showEmpty && !loading && (
				<div className="message">
					<p>Your cart is empty</p>
				</div>
			)}

			{!showEmpty && cart && cart.items.length > 0 && (
				<>
					{submitError && <div className="error-banner">{submitError}</div>}

					<div className="summary-list">
						{cart.items.map((item) => (
							<div key={item.productId} className="summary-item">
								<img
									src={item.imageUrl}
									alt={item.title}
									className="summary-item-image"
								/>
								<div className="summary-item-info">
									<div className="summary-item-title">{item.title}</div>
									<div className="summary-item-price">
										{formatPrice(item.unitPriceSnapshot)} x {item.quantity}
									</div>
								</div>
								<div className="summary-item-total">
									{formatPrice(item.lineTotal)}
								</div>
							</div>
						))}
					</div>

					<div className="summary-subtotal">
						<span>Total</span>
						<span>{formatPrice(cart.subtotal)}</span>
					</div>

					<form className="checkout-form" onSubmit={handleSubmit}>
						<div className="form-group">
							<label className="form-label" htmlFor="checkout-name">
								Name
							</label>
							<input
								id="checkout-name"
								className="form-input"
								type="text"
								required
								maxLength={255}
								value={name}
								onChange={(e) => setName(e.target.value)}
							/>
						</div>
						<div className="form-group">
							<label className="form-label" htmlFor="checkout-email">
								Email
							</label>
							<input
								id="checkout-email"
								className="form-input"
								type="email"
								required
								maxLength={255}
								value={email}
								onChange={(e) => setEmail(e.target.value)}
							/>
						</div>
						<button type="submit" className="submit-btn" disabled={!formValid}>
							{submitting ? "Placing order..." : "Place Order"}
						</button>
					</form>
				</>
			)}
		</div>
	);
}
