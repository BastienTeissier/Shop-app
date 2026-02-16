import type {
	ProductTier,
	RecommendationProduct,
	TieredListComponent,
} from "@shared/a2ui-types.js";
import { renderComponent } from "./registry.js";
import type { A2UIComponentProps } from "./types.js";
import { resolveBinding } from "./utils.js";

const TIER_CONFIG: Record<
	ProductTier,
	{ label: string; icon: string; order: number }
> = {
	essential: { label: "Essential", icon: "⭐", order: 0 },
	recommended: { label: "Recommended", icon: "👍", order: 1 },
	optional: { label: "Optional", icon: "💡", order: 2 },
};

export function TieredListRenderer({
	component: baseComponent,
	context,
}: A2UIComponentProps) {
	const component = baseComponent as TieredListComponent;
	// Resolve the binding to get the array
	const items = resolveBinding(
		context.dataModel,
		component.binding,
	) as RecommendationProduct[];

	// Check if items is an array
	if (!Array.isArray(items)) {
		return (
			<div id={component.id} className={component.className ?? "a2ui-list"}>
				<div className="a2ui-list-empty">
					{component.emptyMessage ?? "No items"}
				</div>
			</div>
		);
	}

	// Empty state
	if (items.length === 0) {
		return (
			<div id={component.id} className={component.className ?? "a2ui-list"}>
				<div className="a2ui-list-empty">
					{component.emptyMessage ?? "No items"}
				</div>
			</div>
		);
	}

	// Group products by tier
	const groupedByTier = groupProductsByTier(items);

	// Get tiers that have products, sorted by order
	const tiersWithProducts = (Object.keys(groupedByTier) as ProductTier[]).sort(
		(a, b) => TIER_CONFIG[a].order - TIER_CONFIG[b].order,
	);

	return (
		<div id={component.id} className={component.className ?? "a2ui-list"}>
			{tiersWithProducts.map((tier) => (
				<div key={tier} className={`tier-section tier-${tier}`}>
					<div className="tier-header">
						<span className="tier-icon">{TIER_CONFIG[tier].icon}</span>
						<span className="tier-label">{TIER_CONFIG[tier].label}</span>
						<span className="tier-count">({groupedByTier[tier].length})</span>
					</div>
					<div className="tier-products">
						{groupedByTier[tier].map((item) => (
							<div key={getItemKey(item)} className="a2ui-list-item">
								{component.template.map((templateComponent) =>
									renderComponent(templateComponent, context, item),
								)}
							</div>
						))}
					</div>
				</div>
			))}
		</div>
	);
}

function groupProductsByTier(
	products: RecommendationProduct[],
): Record<ProductTier, RecommendationProduct[]> {
	const groups: Record<ProductTier, RecommendationProduct[]> = {
		essential: [],
		recommended: [],
		optional: [],
	};

	for (const product of products) {
		const tier = product.tier ?? "recommended"; // Default to recommended if no tier
		groups[tier].push(product);
	}

	// Remove empty groups
	for (const tier of Object.keys(groups) as ProductTier[]) {
		if (groups[tier].length === 0) {
			delete groups[tier];
		}
	}

	return groups;
}

function getItemKey(item: RecommendationProduct): string | number {
	return item.id;
}
