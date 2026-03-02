import type { ImageComponent } from "@shared/a2ui-types.js";

import type { A2UIComponentProps } from "./types.js";
import { resolveBinding } from "./utils.js";

export function ImageRenderer({
	component: baseComponent,
	context,
	itemData,
}: A2UIComponentProps) {
	const component = baseComponent as ImageComponent;
	let src = component.src ?? "";

	// If there's a binding, resolve it
	if (component.binding) {
		const value = resolveBinding(
			context.dataModel,
			component.binding,
			itemData,
		);
		src = value !== undefined && value !== null ? String(value) : "";
	}

	return (
		<img
			id={component.id}
			className={component.className ?? "a2ui-image"}
			src={src}
			alt={component.alt ?? ""}
		/>
	);
}
