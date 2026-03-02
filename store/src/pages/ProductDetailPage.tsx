import { formatPrice } from "@shared/format.js";
import type { Product } from "@shared/types.js";
import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { fetchProduct } from "../api.js";
import { useCart } from "../context/CartContext.js";

type RouteProduct = Product & {
	highlights?: string[];
	reasonWhy?: string[];
	tier?: string;
};

export function ProductDetailPage() {
	const { id } = useParams<{ id: string }>();
	const location = useLocation();
	const { addItem } = useCart();

	const routeProduct = (location.state as { product?: RouteProduct } | null)
		?.product;

	const [product, setProduct] = useState<RouteProduct | null>(
		routeProduct ?? null,
	);
	const [loading, setLoading] = useState(!routeProduct);
	const [notFound, setNotFound] = useState(false);

	useEffect(() => {
		// Skip fetch if we have route state
		if (routeProduct) return;

		const numericId = Number(id);
		if (!id || !Number.isInteger(numericId) || numericId <= 0) {
			setNotFound(true);
			setLoading(false);
			return;
		}

		fetchProduct(numericId)
			.then((res) => {
				if (res.notFound) {
					setNotFound(true);
				} else {
					setProduct(res);
				}
			})
			.catch(() => {
				setNotFound(true);
			})
			.finally(() => setLoading(false));
	}, [id, routeProduct]);

	return (
		<div className="product-detail">
			<Link to="/" className="back-link">
				Back to search
			</Link>

			{loading && <div className="loading-spinner">Loading...</div>}

			{notFound && !loading && (
				<div className="message">
					<p>Product not found</p>
				</div>
			)}

			{product && !loading && (
				<>
					<img
						src={product.imageUrl}
						alt={product.title}
						className="product-detail-image"
					/>
					<div className="product-detail-info">
						<h1 className="product-detail-title">{product.title}</h1>
						<div className="product-detail-price">
							{formatPrice(product.price)}
						</div>
						{product.description && (
							<p className="product-detail-description">
								{product.description}
							</p>
						)}
						{product.reasonWhy && product.reasonWhy.length > 0 && (
							<div className="product-reasons">
								{product.reasonWhy.map((reason) => (
									<span key={reason} className="product-reason-tag">
										{reason}
									</span>
								))}
							</div>
						)}
						{product.highlights && product.highlights.length > 0 && (
							<div className="product-highlights">
								{product.highlights.map((highlight) => (
									<span key={highlight} className="product-highlight-tag">
										{highlight}
									</span>
								))}
							</div>
						)}
					</div>
					<button
						type="button"
						className="product-detail-add-btn"
						onClick={() => addItem(product.id)}
					>
						Add to cart
					</button>
				</>
			)}
		</div>
	);
}
