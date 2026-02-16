export const formatPrice = (priceCents: number) =>
	`$${(priceCents / 100).toFixed(2)}`;
