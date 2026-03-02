import "@/index.css";

import { useLayout } from "skybridge/web";

import { useToolInfo } from "../helpers.js";
import { A2UIRenderer } from "./a2ui/index.js";

export function ProductRecommendations() {
	const { theme } = useLayout();
	const { output, isPending } = useToolInfo<"product-recommendations">();

	// Extract session info from the tool output
	const sessionId = output?.sessionId as string | undefined;
	const initialQuery = output?.initialQuery as string | undefined;
	const streamEndpoint = output?.streamEndpoint as string | undefined;
	const eventEndpoint = output?.eventEndpoint as string | undefined;

	// Loading state while waiting for tool response
	if (isPending) {
		return (
			<div className={`${theme} recommendations-container`}>
				<div className="message">Loading recommendations...</div>
			</div>
		);
	}

	// No session ID means something went wrong
	if (!sessionId) {
		return (
			<div className={`${theme} recommendations-container`}>
				<div className="message error">
					Failed to initialize recommendations. Please try again.
				</div>
			</div>
		);
	}

	return (
		<A2UIRenderer
			sessionId={sessionId}
			initialQuery={initialQuery}
			streamEndpoint={streamEndpoint}
			eventEndpoint={eventEndpoint}
			theme={theme}
		/>
	);
}

export default ProductRecommendations;
