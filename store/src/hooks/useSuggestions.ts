import { useEffect, useState } from "react";

import type { SuggestionChip } from "@shared/a2ui-types.js";

export function useSuggestions(chips: SuggestionChip[]): {
	chips: SuggestionChip[];
	isVisible: boolean;
} {
	const [isVisible, setIsVisible] = useState(false);

	useEffect(() => {
		if (chips.length === 0) {
			setIsVisible(false);
			return;
		}

		// Delay visibility to trigger CSS fade-in
		const id = requestAnimationFrame(() => setIsVisible(true));
		return () => cancelAnimationFrame(id);
	}, [chips]);

	return { chips, isVisible };
}
