import type {
	A2UIComponent,
	A2UIMessage,
	RecommendationDataModel,
} from "@shared/a2ui-types.js";
import { createInitialDataModel } from "@shared/a2ui-types.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { renderComponent } from "./registry.js";
import type { A2UIRendererContext } from "./types.js";

// =============================================================================
// Props
// =============================================================================

type A2UIRendererProps = {
	sessionId: string;
	initialQuery?: string;
	streamEndpoint?: string;
	eventEndpoint?: string;
	theme?: "light" | "dark";
};

// =============================================================================
// Component
// =============================================================================

export function A2UIRenderer({
	sessionId,
	initialQuery = "",
	streamEndpoint = "/api/a2ui/stream",
	eventEndpoint = "/api/a2ui/event",
	theme = "light",
}: A2UIRendererProps) {
	const [surface, setSurface] = useState<A2UIComponent[]>([]);
	const [dataModel, setDataModel] = useState<RecommendationDataModel>(
		createInitialDataModel,
	);
	const [connectionStatus, setConnectionStatus] = useState<
		"connecting" | "connected" | "disconnected" | "error"
	>("connecting");

	const eventSourceRef = useRef<EventSource | null>(null);

	// Handle incoming A2UI messages
	const handleMessage = useCallback((message: A2UIMessage) => {
		switch (message.type) {
			case "beginRendering":
				// Could show loading state
				break;

			case "surfaceUpdate":
				setSurface(message.components);
				break;

			case "dataModelUpdate":
				setDataModel((prev) => {
					return applyDataModelUpdate(prev, message.path, message.value);
				});
				break;

			case "endRendering":
				// Rendering complete
				break;
		}
	}, []);

	// Connect to SSE stream
	useEffect(() => {
		const url = new URL(streamEndpoint, window.location.origin);
		url.searchParams.set("session", sessionId);
		if (initialQuery) {
			url.searchParams.set("query", initialQuery);
		}

		const eventSource = new EventSource(url.toString());
		eventSourceRef.current = eventSource;

		eventSource.onopen = () => {
			setConnectionStatus("connected");
		};

		eventSource.onmessage = (event) => {
			try {
				const message = JSON.parse(event.data) as A2UIMessage;
				handleMessage(message);
			} catch (e) {
				console.error("Failed to parse A2UI message:", e);
			}
		};

		eventSource.onerror = () => {
			setConnectionStatus("error");
		};

		return () => {
			eventSource.close();
			eventSourceRef.current = null;
		};
	}, [sessionId, initialQuery, streamEndpoint, handleMessage]);

	// Send action to server
	const onAction = useCallback(
		async (action: string, payload: Record<string, unknown>) => {
			try {
				const response = await fetch(eventEndpoint, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						sessionId,
						action,
						payload,
					}),
				});

				if (!response.ok) {
					console.error("Action failed:", await response.text());
				}
			} catch (e) {
				console.error("Failed to send action:", e);
			}
		},
		[sessionId, eventEndpoint],
	);

	// Render context
	const context: A2UIRendererContext = {
		dataModel,
		sessionId,
		onAction,
	};

	// Render based on connection status
	if (connectionStatus === "connecting") {
		return (
			<div className={`${theme} recommendations-container`}>
				<div className="message">Connecting to recommendations...</div>
			</div>
		);
	}

	if (connectionStatus === "error") {
		return (
			<div className={`${theme} recommendations-container`}>
				<div className="message error">
					Failed to connect. Please try again.
				</div>
			</div>
		);
	}

	return (
		<div className={`${theme} recommendations-container`}>
			{surface.map((component) => renderComponent(component, context))}
		</div>
	);
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Apply a data model update at the specified path.
 */
function applyDataModelUpdate(
	dataModel: RecommendationDataModel,
	path: string,
	value: unknown,
): RecommendationDataModel {
	// Root update - replace entire model
	if (path === "/" || path === "") {
		return value as RecommendationDataModel;
	}

	// Clone the data model for immutability
	const newModel = structuredClone(dataModel);
	const parts = path.split("/").filter(Boolean);

	let current: Record<string, unknown> = newModel;
	for (let i = 0; i < parts.length - 1; i++) {
		const part = parts[i];
		if (typeof current[part] !== "object" || current[part] === null) {
			current[part] = {};
		}
		current = current[part] as Record<string, unknown>;
	}

	const lastPart = parts[parts.length - 1];
	current[lastPart] = value;

	return newModel;
}
