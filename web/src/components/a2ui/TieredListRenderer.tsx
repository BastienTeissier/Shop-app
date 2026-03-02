import type {
	RecommendationProduct,
	TieredListComponent,
} from "@shared/a2ui-types.js";
import { groupProductsByTier } from "@shared/components/TieredProductGrid.js";
import { renderComponent } from "./registry.js";
import type { A2UIComponentProps } from "./types.js";
import { resolveBinding } from "./utils.js";

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

	// Group products by tier using shared utility
	const tierGroups = groupProductsByTier(items);

	return (
		<div id={component.id} className={component.className ?? "a2ui-list"}>
			{tierGroups.map((group) => (
				<div key={group.tier} className={`tier-section tier-${group.tier}`}>
					<div className="tier-header">
						<span className="tier-icon">{group.icon}</span>
						<span className="tier-label">{group.label}</span>
						<span className="tier-count">({group.products.length})</span>
					</div>
					<div className="tier-products">
						{group.products.map((item) => (
							<div key={item.id} className="a2ui-list-item">
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
