import { z } from "zod";

import { SUGGESTION_CHIP_KINDS } from "@shared/a2ui-types.js";

export const SuggestionChipSchema = z.object({
	label: z.string().describe("Display text for the chip"),
	kind: z.enum(SUGGESTION_CHIP_KINDS).describe("Chip category"),
});

export const SuggestionsSchema = z.object({
	chips: z
		.array(SuggestionChipSchema)
		.max(8)
		.describe("Suggestion chips combining constrained and dynamic categories"),
});

export type Suggestions = z.infer<typeof SuggestionsSchema>;
