import type { ProductTier } from "../a2ui-types.js";

export const TIER_CONFIG: Record<
	ProductTier,
	{ label: string; icon: string; order: number }
> = {
	essential: { label: "Essential", icon: "⭐", order: 0 },
	recommended: { label: "Recommended", icon: "👍", order: 1 },
	optional: { label: "Optional", icon: "💡", order: 2 },
};

export type TierGroup<T> = {
	tier: ProductTier;
	label: string;
	icon: string;
	products: T[];
};

export function groupProductsByTier<T extends { tier?: string }>(
	products: T[],
): TierGroup<T>[] {
	const groups: Record<ProductTier, T[]> = {
		essential: [],
		recommended: [],
		optional: [],
	};

	for (const product of products) {
		const tier = (product.tier ?? "recommended") as ProductTier;
		const bucket = groups[tier];
		if (bucket) {
			bucket.push(product);
		} else {
			groups.recommended.push(product);
		}
	}

	return (Object.keys(groups) as ProductTier[])
		.filter((tier) => groups[tier].length > 0)
		.sort((a, b) => TIER_CONFIG[a].order - TIER_CONFIG[b].order)
		.map((tier) => ({
			tier,
			label: TIER_CONFIG[tier].label,
			icon: TIER_CONFIG[tier].icon,
			products: groups[tier],
		}));
}

export type TieredProductGridProps<T extends { tier?: string }> = {
	products: T[];
	renderProduct: (product: T) => React.ReactNode;
	emptyMessage?: string;
	className?: string;
};

export function TieredProductGrid<T extends { tier?: string }>({
	products,
	renderProduct,
	emptyMessage,
	className,
}: TieredProductGridProps<T>) {
	if (products.length === 0) {
		return (
			<div className={className ?? "product-grid"}>
				<div className="a2ui-list-empty">{emptyMessage ?? "No items"}</div>
			</div>
		);
	}

	const tierGroups = groupProductsByTier(products);

	return (
		<div className={className ?? "product-grid"}>
			{tierGroups.map((group) => (
				<div key={group.tier} className={`tier-section tier-${group.tier}`}>
					<div className="tier-header">
						<span className="tier-icon">{group.icon}</span>
						<span className="tier-label">{group.label}</span>
						<span className="tier-count">({group.products.length})</span>
					</div>
					<div className="tier-products">
						{group.products.map((product) => renderProduct(product))}
					</div>
				</div>
			))}
		</div>
	);
}
