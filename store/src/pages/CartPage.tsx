import { formatPrice } from "@shared/format.js";
import { Link } from "react-router-dom";
import { useCart } from "../context/CartContext";

export function CartPage() {
	const { cart, sessionId, loading, notFound, error, setQuantity, removeItem } =
		useCart();

	return (
		<div className="page-container">
			<h1 className="page-title">Your Cart</h1>
			{error && cart && <div className="error-banner">{error}</div>}
			{loading && <div className="loading-spinner">Loading...</div>}
			{notFound && (
				<div className="message">
					<p>Cart not found</p>
				</div>
			)}
			{error && !cart && (
				<div className="message">
					<p>Something went wrong. Please try again later.</p>
				</div>
			)}
			{!loading && !notFound && !(error && !cart) && cart?.items.length === 0 && (
				<div className="message">
					<p>Your cart is empty</p>
				</div>
			)}
			{cart && cart.items.length > 0 && (
				<>
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
										{formatPrice(item.unitPriceSnapshot)}
									</div>
									<div className="quantity-controls">
										<button
											type="button"
											className="quantity-btn"
											aria-label={`Decrease quantity of ${item.title}`}
											onClick={() =>
												setQuantity(item.productId, item.quantity - 1)
											}
										>
											-
										</button>
										<span className="quantity-value">{item.quantity}</span>
										<button
											type="button"
											className="quantity-btn"
											aria-label={`Increase quantity of ${item.title}`}
											onClick={() =>
												setQuantity(item.productId, item.quantity + 1)
											}
										>
											+
										</button>
									</div>
									<button
										type="button"
										className="remove-btn"
										onClick={() => removeItem(item.productId)}
									>
										Remove
									</button>
								</div>
								<div className="summary-item-total">
									{formatPrice(item.lineTotal)}
								</div>
							</div>
						))}
					</div>
					<div className="summary-subtotal">
						<span>Subtotal</span>
						<span>{formatPrice(cart.subtotal)}</span>
					</div>
					<Link
						to={`/checkout?session=${sessionId}`}
						className="checkout-btn"
					>
						Proceed to checkout
					</Link>
				</>
			)}
		</div>
	);
}
