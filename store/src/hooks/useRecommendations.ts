import { useCallback, useEffect, useRef, useState } from "react";

import type {
	A2UIMessage,
	RecommendationDataModel,
	RecommendationProduct,
	RecommendationStatus,
	SuggestionChip,
} from "@shared/a2ui-types.js";
import { createInitialDataModel } from "@shared/a2ui-types.js";
import { applyDataModelUpdate } from "@shared/a2ui-utils.js";

import { getA2UIStreamUrl, postA2UIEvent } from "../api.js";

export type UseRecommendationsReturn = {
	products: RecommendationProduct[];
	status: RecommendationStatus;
	suggestions: SuggestionChip[];
	connected: boolean;
	error: string | null;
	search: (query: string) => void;
	reconnect: () => void;
};

export function useRecommendations(): UseRecommendationsReturn {
	const sessionIdRef = useRef(crypto.randomUUID());
	const eventSourceRef = useRef<EventSource | null>(null);
	const lastQueryRef = useRef<string>("");
	const hasConnectedRef = useRef(false);

	const [dataModel, setDataModel] = useState<RecommendationDataModel>(
		createInitialDataModel,
	);
	const [connected, setConnected] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const connect = useCallback((query: string) => {
		// Close existing connection
		if (eventSourceRef.current) {
			eventSourceRef.current.close();
			eventSourceRef.current = null;
		}

		// Reset state
		setDataModel(createInitialDataModel());
		setError(null);
		setConnected(false);

		const url = getA2UIStreamUrl(sessionIdRef.current, query);
		const eventSource = new EventSource(url);
		eventSourceRef.current = eventSource;

		eventSource.onopen = () => {
			setConnected(true);
			setError(null);
		};

		eventSource.onmessage = (event) => {
			try {
				const message = JSON.parse(event.data) as A2UIMessage;
				if (message.type === "dataModelUpdate") {
					setDataModel((prev) =>
						applyDataModelUpdate(prev, message.path, message.value),
					);
				}
				// Ignore surfaceUpdate, beginRendering, endRendering — store has own UI
			} catch {
				// Ignore parse errors
			}
		};

		eventSource.onerror = () => {
			setConnected(false);
			setError("Connection lost");
		};

		hasConnectedRef.current = true;
	}, []);

	const search = useCallback(
		(query: string) => {
			lastQueryRef.current = query;

			if (!hasConnectedRef.current) {
				// First search — create EventSource
				connect(query);
			} else {
				// Subsequent search — post event over existing session
				// Reset data model for new search
				setDataModel(createInitialDataModel());
				postA2UIEvent(sessionIdRef.current, "search", { query }).catch(() => {
					setError("Failed to send search");
				});
			}
		},
		[connect],
	);

	const reconnect = useCallback(() => {
		// Generate new session ID since old session may be deleted
		sessionIdRef.current = crypto.randomUUID();
		hasConnectedRef.current = false;
		connect(lastQueryRef.current);
	}, [connect]);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (eventSourceRef.current) {
				eventSourceRef.current.close();
				eventSourceRef.current = null;
			}
		};
	}, []);

	return {
		products: dataModel.products,
		status: dataModel.status,
		suggestions: dataModel.suggestions?.chips ?? [],
		connected,
		error,
		search,
		reconnect,
	};
}
