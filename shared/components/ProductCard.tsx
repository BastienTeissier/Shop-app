import { formatPrice } from "../format.js";

export type ProductCardProduct = {
	id: number;
	title: string;
	imageUrl: string;
	price: number;
	description?: string;
	highlights?: string[];
	reasonWhy?: string[];
};

export type ProductCardProps = {
	product: ProductCardProduct;
	selected?: boolean;
	onCardClick?: () => void;
	onAddToCart?: () => void;
	className?: string;
};

export function ProductCard({
	product,
	selected,
	onCardClick,
	onAddToCart,
	className,
}: ProductCardProps) {
	return (
		<div
			className={`product-card ${selected ? "selected" : ""} ${className ?? ""}`}
		>
			<button type="button" className="product-card-main" onClick={onCardClick}>
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
			</button>
			{onAddToCart && (
				<button
					type="button"
					className="cart-button"
					onClick={(e) => {
						e.stopPropagation();
						onAddToCart();
					}}
				>
					Add to cart
				</button>
			)}
		</div>
	);
}
