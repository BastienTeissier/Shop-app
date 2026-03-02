import type {
	ProductCardComponent,
	RecommendationProduct,
} from "@shared/a2ui-types.js";
import { ProductCard as SharedProductCard } from "@shared/components/ProductCard.js";
import type { A2UIComponentProps } from "./types.js";
import { resolveBinding } from "./utils.js";

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
		<SharedProductCard
			product={product}
			selected={isSelected}
			onCardClick={handleSelect}
			onAddToCart={handleAddToCart}
		/>
	);
}
