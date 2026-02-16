import type {
	RecommendationDataModel,
	RefineInputComponent,
} from "@shared/a2ui-types.js";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { RefineInput } from "./RefineInput.js";
import type { A2UIRendererContext } from "./types.js";

// =============================================================================
// Test Helpers
// =============================================================================

function makeDataModel(): RecommendationDataModel {
	return {
		query: "",
		constraints: {},
		products: [],
		status: { phase: "idle", message: "Ready" },
		ui: { query: "" },
		cart: { items: [], totalQuantity: 0, totalPrice: 0 },
	};
}

function makeComponent(
	overrides: Partial<RefineInputComponent> = {},
): RefineInputComponent {
	return {
		type: "refineInput",
		id: "test-refine-input",
		action: "refine",
		...overrides,
	};
}

function makeContext(onAction: Mock = vi.fn()): A2UIRendererContext {
	return {
		dataModel: makeDataModel(),
		sessionId: "test-session",
		onAction,
	};
}

// =============================================================================
// Tests
// =============================================================================

describe("RefineInput", () => {
	let mockOnAction: Mock;

	beforeEach(() => {
		mockOnAction = vi.fn();
	});

	describe("rendering", () => {
		it("renders input and button", () => {
			const component = makeComponent();
			const context = makeContext(mockOnAction);

			render(<RefineInput component={component} context={context} />);

			expect(screen.getByRole("textbox")).toBeInTheDocument();
			expect(
				screen.getByRole("button", { name: "Refine" }),
			).toBeInTheDocument();
		});

		it("shows custom placeholder when provided", () => {
			const component = makeComponent({
				placeholder: "Custom placeholder text",
			});
			const context = makeContext(mockOnAction);

			render(<RefineInput component={component} context={context} />);

			expect(
				screen.getByPlaceholderText("Custom placeholder text"),
			).toBeInTheDocument();
		});

		it("shows default placeholder when not provided", () => {
			const component = makeComponent();
			const context = makeContext(mockOnAction);

			render(<RefineInput component={component} context={context} />);

			expect(
				screen.getByPlaceholderText(
					"Refine: 'exclude jackets', 'show under $100'...",
				),
			).toBeInTheDocument();
		});

		it("applies custom className when provided", () => {
			const component = makeComponent({
				className: "custom-refine-class",
			});
			const context = makeContext(mockOnAction);

			const { container } = render(
				<RefineInput component={component} context={context} />,
			);

			expect(
				container.querySelector(".custom-refine-class"),
			).toBeInTheDocument();
		});
	});

	describe("button state", () => {
		it("disables button when input is empty", () => {
			const component = makeComponent();
			const context = makeContext(mockOnAction);

			render(<RefineInput component={component} context={context} />);

			expect(screen.getByRole("button", { name: "Refine" })).toBeDisabled();
		});

		it("disables button when input only has whitespace", async () => {
			const user = userEvent.setup();
			const component = makeComponent();
			const context = makeContext(mockOnAction);

			render(<RefineInput component={component} context={context} />);

			await user.type(screen.getByRole("textbox"), "   ");

			expect(screen.getByRole("button", { name: "Refine" })).toBeDisabled();
		});

		it("enables button when input has text", async () => {
			const user = userEvent.setup();
			const component = makeComponent();
			const context = makeContext(mockOnAction);

			render(<RefineInput component={component} context={context} />);

			await user.type(screen.getByRole("textbox"), "exclude jackets");

			expect(screen.getByRole("button", { name: "Refine" })).not.toBeDisabled();
		});
	});

	describe("form submission", () => {
		it("calls onAction with refine action on button click", async () => {
			const user = userEvent.setup();
			const component = makeComponent({ action: "refine" });
			const context = makeContext(mockOnAction);

			render(<RefineInput component={component} context={context} />);

			await user.type(screen.getByRole("textbox"), "budget under $50");
			await user.click(screen.getByRole("button", { name: "Refine" }));

			expect(mockOnAction).toHaveBeenCalledWith("refine", {
				query: "budget under $50",
			});
		});

		it("calls onAction on Enter key press", async () => {
			const user = userEvent.setup();
			const component = makeComponent({ action: "refine" });
			const context = makeContext(mockOnAction);

			render(<RefineInput component={component} context={context} />);

			const input = screen.getByRole("textbox");
			await user.type(input, "show only jackets{Enter}");

			expect(mockOnAction).toHaveBeenCalledWith("refine", {
				query: "show only jackets",
			});
		});

		it("clears input after submission", async () => {
			const user = userEvent.setup();
			const component = makeComponent();
			const context = makeContext(mockOnAction);

			render(<RefineInput component={component} context={context} />);

			const input = screen.getByRole("textbox");
			await user.type(input, "some query");
			await user.click(screen.getByRole("button", { name: "Refine" }));

			expect(input).toHaveValue("");
		});

		it("does not call onAction when input is empty", async () => {
			const user = userEvent.setup();
			const component = makeComponent();
			const context = makeContext(mockOnAction);

			render(<RefineInput component={component} context={context} />);

			const input = screen.getByRole("textbox");
			await user.type(input, "{Enter}");

			expect(mockOnAction).not.toHaveBeenCalled();
		});

		it("trims whitespace from query before submitting", async () => {
			const user = userEvent.setup();
			const component = makeComponent();
			const context = makeContext(mockOnAction);

			render(<RefineInput component={component} context={context} />);

			await user.type(screen.getByRole("textbox"), "  trimmed query  ");
			await user.click(screen.getByRole("button", { name: "Refine" }));

			expect(mockOnAction).toHaveBeenCalledWith("refine", {
				query: "trimmed query",
			});
		});
	});

	describe("custom action", () => {
		it("uses custom action name from component", async () => {
			const user = userEvent.setup();
			const component = makeComponent({ action: "customRefine" });
			const context = makeContext(mockOnAction);

			render(<RefineInput component={component} context={context} />);

			await user.type(screen.getByRole("textbox"), "test");
			await user.click(screen.getByRole("button", { name: "Refine" }));

			expect(mockOnAction).toHaveBeenCalledWith("customRefine", {
				query: "test",
			});
		});
	});
});
