import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProductRecommendations } from "./product-recommendations";

const mocks = vi.hoisted(() => ({
	theme: "light" as string,
	useToolInfo: vi.fn(),
}));

vi.mock("skybridge/web", () => ({
	useLayout: vi.fn(() => ({ theme: mocks.theme })),
}));

vi.mock("../helpers.js", () => ({
	useToolInfo: mocks.useToolInfo,
}));

vi.mock("./a2ui/index.js", () => ({
	A2UIRenderer: vi.fn(({ sessionId }: { sessionId: string }) => (
		<div data-testid="a2ui-renderer">Session: {sessionId}</div>
	)),
}));

describe("ProductRecommendations", () => {
	beforeEach(() => {
		mocks.theme = "light";
		mocks.useToolInfo.mockReset();
	});

	it("shows loading state when pending", () => {
		mocks.useToolInfo.mockReturnValue({ output: undefined, isPending: true });
		render(<ProductRecommendations />);
		expect(screen.getByText("Loading recommendations...")).toBeInTheDocument();
	});

	it("shows error when no sessionId", () => {
		mocks.useToolInfo.mockReturnValue({ output: undefined, isPending: false });
		render(<ProductRecommendations />);
		expect(
			screen.getByText(
				"Failed to initialize recommendations. Please try again.",
			),
		).toBeInTheDocument();
	});

	it("renders A2UIRenderer with correct props", () => {
		mocks.useToolInfo.mockReturnValue({
			output: {
				sessionId: "test-session-123",
				initialQuery: "running shoes",
				streamEndpoint: "/api/a2ui/stream",
				eventEndpoint: "/api/a2ui/event",
			},
			isPending: false,
		});
		render(<ProductRecommendations />);
		expect(screen.getByTestId("a2ui-renderer")).toBeInTheDocument();
		expect(screen.getByText("Session: test-session-123")).toBeInTheDocument();
	});

	it("applies dark theme class", () => {
		mocks.theme = "dark";
		mocks.useToolInfo.mockReturnValue({ output: undefined, isPending: true });
		const { container } = render(<ProductRecommendations />);
		expect(container.querySelector(".dark")).toBeInTheDocument();
	});
});
