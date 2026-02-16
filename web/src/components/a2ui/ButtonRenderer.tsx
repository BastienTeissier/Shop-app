import type { ButtonComponent } from "@shared/a2ui-types.js";
import { useState } from "react";
import type { A2UIComponentProps } from "./types.js";

export function ButtonRenderer({
	component: baseComponent,
	context,
	itemData,
}: A2UIComponentProps) {
	const component = baseComponent as ButtonComponent;
	const [isLoading, setIsLoading] = useState(false);

	async function handleClick() {
		if (component.disabled || isLoading) return;

		setIsLoading(true);
		try {
			// Merge item data into payload if in list context
			const payload = {
				...component.payload,
				...(itemData && typeof itemData === "object" ? itemData : {}),
			};
			context.onAction(component.action, payload);
		} finally {
			setIsLoading(false);
		}
	}

	return (
		<button
			type="button"
			id={component.id}
			className={component.className ?? "a2ui-button"}
			onClick={handleClick}
			disabled={component.disabled || isLoading}
		>
			{isLoading ? "..." : component.label}
		</button>
	);
}
