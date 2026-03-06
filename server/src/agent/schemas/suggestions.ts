import { z } from "zod";

export const SuggestionChipSchema = z.object({
	label: z.string().describe("Display text for the chip"),
	kind: z
		.enum([
			"gender",
			"priceRange",
			"size",
			"material",
			"activity",
			"brand",
			"color",
			"season",
			"feature",
			"other",
		])
		.describe("Chip category"),
});

export const SuggestionsSchema = z.object({
	chips: z
		.array(SuggestionChipSchema)
		.max(8)
		.describe("Suggestion chips combining constrained and dynamic categories"),
});

export type Suggestions = z.infer<typeof SuggestionsSchema>;
