import type { ListComponent } from "@shared/a2ui-types.js";

import { renderComponent } from "./registry.js";
import type { A2UIComponentProps } from "./types.js";
import { resolveBinding } from "./utils.js";

export function ListRenderer({
	component: baseComponent,
	context,
}: A2UIComponentProps) {
	const component = baseComponent as ListComponent;
	// Resolve the binding to get the array
	const items = resolveBinding(context.dataModel, component.binding);

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

	// Render each item using the template
	return (
		<div id={component.id} className={component.className ?? "a2ui-list"}>
			{items.map((item, index) => (
				<div key={getItemKey(item, index)} className="a2ui-list-item">
					{component.template.map((templateComponent) =>
						renderComponent(templateComponent, context, item),
					)}
				</div>
			))}
		</div>
	);
}

function getItemKey(item: unknown, index: number): string | number {
	if (typeof item === "object" && item !== null && "id" in item) {
		return (item as { id: string | number }).id;
	}
	return index;
}
