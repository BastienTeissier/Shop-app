import "@/index.css";

import { useLayout } from "skybridge/web";

import { useToolInfo } from "../helpers.js";

const formatPrice = (priceCents: number) => `$${(priceCents / 100).toFixed(2)}`;

export function CartSummary() {
	const { theme } = useLayout();
	const { output, isPending } = useToolInfo<"cart-summary">();

	if (isPending) {
		return <div className={`${theme} container`} />;
	}

	const items = output?.items ?? [];
	const subtotal = output?.subtotal ?? 0;

	// Empty cart or error: render empty list, no subtotal
	if (items.length === 0) {
		return (
			<div className={`${theme} container`}>
				<div className="summary-list" />
			</div>
		);
	}

	return (
		<div className={`${theme} container`}>
			<div className="summary-list">
				{items.map((item) => (
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
				<span>{formatPrice(subtotal)}</span>
			</div>
		</div>
	);
}

export default CartSummary;
