// Product (API shape, not Prisma model)
export type Product = {
	id: number;
	title: string;
	description: string;
	imageUrl: string;
	price: number;
	category?: string | null;
};

// Cart snapshot types (used by cart tool)
export type CartSnapshotItem = {
	productId: number;
	quantity: number;
	priceSnapshot: number;
};

export type CartSnapshot = {
	items: CartSnapshotItem[];
	totalQuantity: number;
	totalPrice: number;
};

// Cart widget state (used by useWidgetState in ecom-carousel)
export type CartWidgetState = {
	snapshot: CartSnapshot;
	sessionId?: string;
	cartDisabled?: boolean;
	error?: string;
};

// Cart summary types (used by cart-summary widget)
export type CartSummaryItem = {
	productId: number;
	title: string;
	imageUrl: string;
	unitPriceSnapshot: number;
	quantity: number;
	lineTotal: number;
};

export type CartSummary = {
	items: CartSummaryItem[];
	subtotal: number;
};

// API response type (used by REST endpoints and store frontend)
export type CartSummaryApiResponse = CartSummary & { notFound: boolean };
