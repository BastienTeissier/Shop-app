import type { A2UIComponent } from "@shared/a2ui-types.js";
import { ButtonRenderer } from "./ButtonRenderer.js";
import { ColumnRenderer } from "./ColumnRenderer.js";
import { ImageRenderer } from "./ImageRenderer.js";
import { InputRenderer } from "./InputRenderer.js";
import { ListRenderer } from "./ListRenderer.js";
import { ProductCard } from "./ProductCard.js";
import { RefineInput } from "./RefineInput.js";
import { RowRenderer } from "./RowRenderer.js";
// Import all component renderers
import { TextRenderer } from "./TextRenderer.js";
import { TieredListRenderer } from "./TieredListRenderer.js";
import type { A2UIRendererContext, ComponentRegistry } from "./types.js";

// Component registry mapping type to renderer
const registry: ComponentRegistry = {
	text: TextRenderer,
	image: ImageRenderer,
	button: ButtonRenderer,
	input: InputRenderer,
	row: RowRenderer,
	column: ColumnRenderer,
	list: ListRenderer,
	tieredList: TieredListRenderer,
	productCard: ProductCard,
	refineInput: RefineInput,
};

/**
 * Render an A2UI component using the registry.
 */
export function renderComponent(
	component: A2UIComponent,
	context: A2UIRendererContext,
	itemData?: unknown,
): React.ReactNode {
	const Renderer = registry[component.type];

	if (!Renderer) {
		console.warn(`Unknown component type: ${component.type}`);
		return null;
	}

	return (
		<Renderer
			key={component.id}
			component={component as never}
			context={context}
			itemData={itemData}
		/>
	);
}

/**
 * Register a custom component renderer.
 */
export function registerComponent(
	type: string,
	renderer: ComponentRegistry[string],
): void {
	registry[type] = renderer;
}
