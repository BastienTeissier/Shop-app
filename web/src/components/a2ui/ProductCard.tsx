import type {
	ProductCardComponent,
	RecommendationProduct,
} from "@shared/a2ui-types.js";
import type { A2UIComponentProps } from "./types.js";
import { formatPrice, resolveBinding } from "./utils.js";

export function ProductCard({
	component: baseComponent,
	context,
	itemData,
}: A2UIComponentProps) {
	const component = baseComponent as ProductCardComponent;
	// Resolve the product data
	const product = (
		component.binding === "."
			? itemData
			: resolveBinding(context.dataModel, component.binding, itemData)
	) as RecommendationProduct | undefined;

	if (!product) {
		return null;
	}

	function handleAddToCart() {
		if (!product) return;
		context.onAction("addToCart", { productId: product.id });
	}

	function handleSelect() {
		if (!product) return;
		context.onAction("selectProduct", { productId: product.id });
	}

	const isSelected = context.dataModel.ui.selectedProductId === product.id;

	return (
		<div className={`product-card ${isSelected ? "selected" : ""}`}>
			<button
				type="button"
				className="product-card-main"
				onClick={handleSelect}
			>
				<img
					src={product.imageUrl}
					alt={product.title}
					className="product-image"
				/>
				<div className="product-info">
					<div className="product-title">{product.title}</div>
					<div className="product-price">{formatPrice(product.price)}</div>
					{product.description && (
						<div className="product-description">
							{product.description.length > 100
								? `${product.description.slice(0, 100)}...`
								: product.description}
						</div>
					)}
					{product.reasonWhy.length > 0 && (
						<div className="product-reasons">
							{product.reasonWhy.map((reason) => (
								<span key={reason} className="product-reason-tag">
									{reason}
								</span>
							))}
						</div>
					)}
					{product.highlights.length > 0 && (
						<div className="product-highlights">
							{product.highlights.map((highlight) => (
								<span key={highlight} className="product-highlight-tag">
									{highlight}
								</span>
							))}
						</div>
					)}
				</div>
			</button>
			<button type="button" className="cart-button" onClick={handleAddToCart}>
				Add to cart
			</button>
		</div>
	);
}
