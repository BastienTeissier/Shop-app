import type { TextComponent } from "@shared/a2ui-types.js";

import type { A2UIComponentProps } from "./types.js";
import { resolveBinding } from "./utils.js";

export function TextRenderer({
	component: baseComponent,
	context,
	itemData,
}: A2UIComponentProps) {
	const component = baseComponent as TextComponent;
	let content = component.content ?? "";

	// If there's a binding, resolve it
	if (component.binding) {
		const value = resolveBinding(
			context.dataModel,
			component.binding,
			itemData,
		);
		content = value !== undefined && value !== null ? String(value) : "";
	}

	return (
		<span id={component.id} className={component.className ?? "a2ui-text"}>
			{content}
		</span>
	);
}
