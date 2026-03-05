import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { formatPrice } from "@shared/format.js";
import type { OrderSummary } from "@shared/types.js";

import { orderFetch } from "../api.js";

export function OrderConfirmationPage() {
	const { reference } = useParams<{ reference: string }>();
	const [order, setOrder] = useState<OrderSummary | null>(null);
	const [loading, setLoading] = useState(true);
	const [notFound, setNotFound] = useState(false);

	useEffect(() => {
		if (!reference) {
			setNotFound(true);
			setLoading(false);
			return;
		}

		orderFetch(reference)
			.then((res) => {
				if ("error" in res || res.notFound) {
					setNotFound(true);
				} else {
					setOrder(res);
				}
			})
			.catch(() => {
				setNotFound(true);
			})
			.finally(() => setLoading(false));
	}, [reference]);

	return (
		<div className="page-container">
			{loading && <div className="loading-spinner">Loading...</div>}

			{notFound && !loading && (
				<div className="message">
					<p>Order not found</p>
				</div>
			)}

			{order && !loading && (
				<>
					<h1 className="page-title">Order placed successfully</h1>

					<div className="order-reference">{order.reference}</div>

					<div className="confirmation-section">
						<p>
							<strong>Name:</strong> {order.customerName}
						</p>
						<p>
							<strong>Email:</strong> {order.customerEmail}
						</p>
					</div>

					<div className="confirmation-section">
						<div className="summary-list">
							{order.items.map((item) => (
								<div key={item.productId} className="summary-item">
									<img
										src={item.imageUrl}
										alt={item.title}
										className="summary-item-image"
									/>
									<div className="summary-item-info">
										<div className="summary-item-title">{item.title}</div>
										<div className="summary-item-price">
											{formatPrice(item.unitPrice)} x {item.quantity}
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
							<span>{formatPrice(order.totalPrice)}</span>
						</div>
					</div>

					<Link to="/" className="continue-link">
						Continue shopping
					</Link>
				</>
			)}
		</div>
	);
}
