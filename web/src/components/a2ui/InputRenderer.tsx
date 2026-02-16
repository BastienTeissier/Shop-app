import type { InputComponent } from "@shared/a2ui-types.js";
import { useCallback, useState } from "react";
import type { A2UIComponentProps } from "./types.js";
import { resolveBinding } from "./utils.js";

export function InputRenderer({
	component: baseComponent,
	context,
	itemData,
}: A2UIComponentProps) {
	const component = baseComponent as InputComponent;
	// Get initial value from binding if available
	const initialValue = component.binding
		? String(
				resolveBinding(context.dataModel, component.binding, itemData) ?? "",
			)
		: "";

	const [value, setValue] = useState(initialValue);

	const handleSubmit = useCallback(() => {
		if (!value.trim()) return;
		context.onAction(component.action, { query: value.trim() });
	}, [value, component.action, context]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				handleSubmit();
			}
		},
		[handleSubmit],
	);

	return (
		<div className={component.className ?? "a2ui-input-container"}>
			<input
				type="text"
				id={component.id}
				className="a2ui-input"
				placeholder={component.placeholder}
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onKeyDown={handleKeyDown}
			/>
			<button
				type="button"
				className="a2ui-input-submit"
				onClick={handleSubmit}
			>
				Search
			</button>
		</div>
	);
}
