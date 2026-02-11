// A2UI Protocol Types for Product Recommendations
// Based on A2UI specification from docs/features/recommandation/initial.md

// =============================================================================
// A2UI Message Types
// =============================================================================

export type A2UIMessage =
	| BeginRenderingMessage
	| SurfaceUpdateMessage
	| DataModelUpdateMessage
	| EndRenderingMessage;

export type BeginRenderingMessage = {
	type: "beginRendering";
};

export type EndRenderingMessage = {
	type: "endRendering";
};

export type SurfaceUpdateMessage = {
	type: "surfaceUpdate";
	surfaceId: string;
	components: A2UIComponent[];
};

export type DataModelUpdateMessage = {
	type: "dataModelUpdate";
	surfaceId: string;
	path: string;
	value: unknown;
};

// =============================================================================
// A2UI Component Types
// =============================================================================

export type A2UIComponent =
	| TextComponent
	| ImageComponent
	| ButtonComponent
	| RowComponent
	| ColumnComponent
	| ListComponent
	| TieredListComponent
	| InputComponent
	| RefineInputComponent
	| ProductCardComponent;

export type A2UIComponentBase = {
	id: string;
};

export type TextComponent = A2UIComponentBase & {
	type: "text";
	content?: string;
	binding?: string; // e.g., "/status/message"
	className?: string;
};

export type ImageComponent = A2UIComponentBase & {
	type: "image";
	src?: string;
	binding?: string;
	alt?: string;
	className?: string;
};

export type ButtonComponent = A2UIComponentBase & {
	type: "button";
	label: string;
	action: string;
	payload?: Record<string, unknown>;
	disabled?: boolean;
	className?: string;
};

export type RowComponent = A2UIComponentBase & {
	type: "row";
	children: A2UIComponent[];
	className?: string;
};

export type ColumnComponent = A2UIComponentBase & {
	type: "column";
	children: A2UIComponent[];
	className?: string;
};

export type ListComponent = A2UIComponentBase & {
	type: "list";
	binding: string; // e.g., "/products"
	template: A2UIComponent[];
	emptyMessage?: string;
	className?: string;
};

export type TieredListComponent = A2UIComponentBase & {
	type: "tieredList";
	binding: string; // e.g., "/products"
	template: A2UIComponent[];
	emptyMessage?: string;
	className?: string;
};

export type InputComponent = A2UIComponentBase & {
	type: "input";
	placeholder?: string;
	action: string;
	binding?: string;
	className?: string;
};

export type RefineInputComponent = A2UIComponentBase & {
	type: "refineInput";
	placeholder?: string;
	action: string;
	className?: string;
};

export type ProductCardComponent = A2UIComponentBase & {
	type: "productCard";
	binding: string; // binds to a single product in the data model
};

// =============================================================================
// User Action Types
// =============================================================================

export type UserAction = {
	sessionId: string;
	action: string;
	payload: Record<string, unknown>;
};

export type SearchAction = UserAction & {
	action: "search";
	payload: {
		query: string;
	};
};

export type SelectProductAction = UserAction & {
	action: "selectProduct";
	payload: {
		productId: number;
	};
};

export type AddToCartAction = UserAction & {
	action: "addToCart";
	payload: {
		productId: number;
	};
};

export type RefineAction = UserAction & {
	action: "refine";
	payload: {
		query: string;
	};
};

// =============================================================================
// Recommendation Data Model Types
// =============================================================================

export type ProductTier = "essential" | "recommended" | "optional";

export type RecommendationProduct = {
	id: number;
	title: string;
	description: string;
	imageUrl: string;
	price: number; // in cents
	highlights: string[];
	reasonWhy: string[];
	tier?: ProductTier;
	subCategory?: string;
};

export type RecommendationConstraints = {
	category?: string;
	budget?: number; // in cents
	brand?: string;
	features?: string[];
};

export type RecommendationStatus = {
	phase: "idle" | "searching" | "ranking" | "completed" | "error";
	message: string;
	progress?: number; // 0-100
};

export type RecommendationUIState = {
	selectedProductId?: number;
	query: string;
};

export type RecommendationCart = {
	items: Array<{
		productId: number;
		quantity: number;
	}>;
	totalQuantity: number;
	totalPrice: number;
};

export type LastRecommendation = {
	query: string;
	products: RecommendationProduct[];
};

export type RecommendationDataModel = {
	query: string;
	constraints: RecommendationConstraints;
	products: RecommendationProduct[];
	status: RecommendationStatus;
	ui: RecommendationUIState;
	cart: RecommendationCart;
	lastRecommendation?: LastRecommendation;
};

// =============================================================================
// Data Model Factory
// =============================================================================

export function createInitialDataModel(): RecommendationDataModel {
	return {
		query: "",
		constraints: {},
		products: [],
		status: { phase: "idle", message: "Ready to search" },
		ui: { query: "" },
		cart: { items: [], totalQuantity: 0, totalPrice: 0 },
	};
}

// =============================================================================
// Session Types
// =============================================================================

export type A2UISession = {
	sessionId: string;
	dataModel: RecommendationDataModel;
	cartSessionId?: string; // links to existing cart system
	createdAt: Date;
};
