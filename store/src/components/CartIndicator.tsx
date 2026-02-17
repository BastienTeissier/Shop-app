import { formatPrice } from "@shared/format.js";
import { Link } from "react-router-dom";
import { useCart } from "../context/CartContext";

export function CartIndicator() {
	const { cart, sessionId, totalQuantity, error } = useCart();

	if (!cart || totalQuantity === 0) return null;

	return (
		<>
			{error && <div className="error-banner">{error}</div>}
			<div className="cart-indicator">
				<Link to={`/cart?session=${sessionId}`} className="cart-indicator-link">
					{totalQuantity} {totalQuantity === 1 ? "item" : "items"} &middot;{" "}
					{formatPrice(cart.subtotal)}
				</Link>
			</div>
		</>
	);
}
