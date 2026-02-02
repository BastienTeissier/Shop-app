import type {
	A2UIComponent,
	RecommendationDataModel,
} from "@shared/a2ui-types.js";

// =============================================================================
// Renderer Context Types
// =============================================================================

export type A2UIRendererContext = {
	dataModel: RecommendationDataModel;
	sessionId: string;
	onAction: (action: string, payload: Record<string, unknown>) => void;
};

export type A2UIComponentProps = {
	component: A2UIComponent;
	context: A2UIRendererContext;
	itemData?: unknown; // For list template rendering
};

// =============================================================================
// Component Registry Types
// =============================================================================

export type A2UIComponentRenderer = React.ComponentType<A2UIComponentProps>;

export type ComponentRegistry = {
	[key: string]: A2UIComponentRenderer;
};
