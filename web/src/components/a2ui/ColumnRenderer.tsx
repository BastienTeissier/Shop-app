import type { ColumnComponent } from "@shared/a2ui-types.js";
import { renderComponent } from "./registry.js";
import type { A2UIComponentProps } from "./types.js";

export function ColumnRenderer({
	component: baseComponent,
	context,
	itemData,
}: A2UIComponentProps) {
	const component = baseComponent as ColumnComponent;
	return (
		<div id={component.id} className={component.className ?? "a2ui-column"}>
			{component.children.map((child) =>
				renderComponent(child, context, itemData),
			)}
		</div>
	);
}
