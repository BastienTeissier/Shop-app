import type { RefineInputComponent } from "@shared/a2ui-types.js";
import { useCallback, useState } from "react";
import type { A2UIComponentProps } from "./types.js";

export function RefineInput({
	component: baseComponent,
	context,
}: A2UIComponentProps) {
	const component = baseComponent as RefineInputComponent;
	const [value, setValue] = useState("");

	const handleSubmit = useCallback(() => {
		const trimmed = value.trim();
		if (!trimmed) return;
		context.onAction(component.action, { query: trimmed });
		setValue(""); // Clear input after submit
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

	const isDisabled = !value.trim();

	return (
		<div className={component.className ?? "refine-input-container"}>
			<input
				type="text"
				id={component.id}
				className="refine-input"
				placeholder={
					component.placeholder ??
					"Refine: 'exclude jackets', 'show under $100'..."
				}
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onKeyDown={handleKeyDown}
			/>
			<button
				type="button"
				className="refine-input-submit"
				onClick={handleSubmit}
				disabled={isDisabled}
			>
				Refine
			</button>
		</div>
	);
}
