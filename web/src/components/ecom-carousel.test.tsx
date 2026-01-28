import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EcomCarousel } from "./ecom-carousel";

type Product = {
	id: number;
	title: string;
	description: string;
	imageUrl: string;
	price: number;
};

const mocks = vi.hoisted(() => ({
	locale: "en-US",
	theme: "light",
	requestModal: { open: vi.fn(), isOpen: false },
	openExternal: vi.fn(),
	widgetState: undefined as
		| {
				ids: number[];
				sessionId?: string;
				cartDisabled?: boolean;
				error?: string;
		  }
		| undefined,
	useToolInfo: vi.fn(),
	callToolAsync: vi.fn(),
}));

// TODO: use a global mock for skybridge/web when more tests files are added
vi.mock("skybridge/web", async () => {
	const React = await import("react");
	return {
		useLayout: vi.fn(() => ({ theme: mocks.theme })),
		useUser: vi.fn(() => ({ locale: mocks.locale })),
		useRequestModal: vi.fn(() => mocks.requestModal),
		useOpenExternal: vi.fn(() => mocks.openExternal),
		useWidgetState: vi.fn(
			(initial: {
				ids: number[];
				sessionId?: string;
				cartDisabled?: boolean;
				error?: string;
			}) => {
				const [state, setState] = React.useState(mocks.widgetState ?? initial);
				return [state, setState] as const;
			},
		),
	};
});

vi.mock("../helpers.js", () => ({
	useToolInfo: mocks.useToolInfo,
	useCallTool: () => ({ callToolAsync: mocks.callToolAsync }),
}));

// TODO: setup factories for tests when more tests files are added
const makeProduct = (overrides: Partial<Product> = {}): Product => ({
	id: 1,
	title: "Road Bike",
	description: "Fast bike",
	imageUrl: "https://example.com/road-bike.png",
	price: 1999,
	...overrides,
});

const renderCarousel = (options?: {
	products?: Product[] | null;
	isPending?: boolean;
}) => {
	const { products = [makeProduct()], isPending = false } = options ?? {};
	const output = products === null ? undefined : { products };
	mocks.useToolInfo.mockReturnValue({ output, isPending });
	return render(<EcomCarousel />);
};

describe("EcomCarousel", () => {
	beforeEach(() => {
		mocks.locale = "en-US";
		mocks.theme = "light";
		mocks.requestModal = { open: vi.fn(), isOpen: false };
		mocks.openExternal = vi.fn();
		mocks.widgetState = undefined;
		mocks.useToolInfo.mockReset();
		mocks.callToolAsync.mockReset();
		mocks.callToolAsync.mockResolvedValue({
			isError: false,
			structuredContent: {
				sessionId: "00000000-0000-0000-0000-000000000000",
			},
		});
	});

	it("renders the loading state", () => {
		renderCarousel({ products: null, isPending: true });

		expect(screen.getByText("Loading products...")).toBeInTheDocument();
	});

	it("renders the empty state", () => {
		renderCarousel({ products: [] });

		expect(screen.getByText("No product found")).toBeInTheDocument();
	});

	it("updates the product detail when a card is selected", async () => {
		const products = [
			makeProduct({ id: 1, title: "Road Bike", description: "Fast ride" }),
			makeProduct({
				id: 2,
				title: "Trail Bike",
				description: "Mud ready",
				imageUrl: "https://example.com/trail-bike.png",
				price: 2500,
			}),
		];
		renderCarousel({ products });

		expect(screen.getByText("Fast ride")).toBeInTheDocument();

		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: /Trail Bike/ }));

		expect(screen.getByText("Mud ready")).toBeInTheDocument();
		expect(screen.queryByText("Fast ride")).not.toBeInTheDocument();
	});

	it("toggles cart state and opens the checkout modal", async () => {
		renderCarousel();

		const user = userEvent.setup();
		const cartIndicator = screen.getByRole("button", { name: /🛒/ });
		expect(cartIndicator).toBeDisabled();

		await user.click(screen.getByRole("button", { name: "Add to cart" }));

		expect(
			await screen.findByRole("button", { name: "Remove" }),
		).toBeInTheDocument();
		expect(cartIndicator).toBeEnabled();
		expect(cartIndicator).toHaveTextContent("1");

		await user.click(cartIndicator);

		expect(mocks.requestModal.open).toHaveBeenCalledWith({
			title: "Proceed to checkout ?",
		});
	});

	it("renders checkout summary and opens the checkout URL", async () => {
		const products = [
			makeProduct({ id: 1, title: "Road Bike", price: 1999 }),
			makeProduct({
				id: 2,
				title: "Trail Bike",
				imageUrl: "https://example.com/trail-bike.png",
				price: 2500,
			}),
		];
		mocks.requestModal = { open: vi.fn(), isOpen: true };
		mocks.widgetState = { ids: [1, 2] };

		renderCarousel({ products });

		expect(screen.getByText("Order summary")).toBeInTheDocument();
		expect(screen.getByText("Total")).toBeInTheDocument();
		expect(screen.getByText("$44.99")).toBeInTheDocument();

		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: "Checkout" }));

		expect(mocks.openExternal).toHaveBeenCalledWith(
			"https://alpic.ai/?cart=1%2C2",
		);
	});

	it("uses locale translations for labels", () => {
		mocks.locale = "fr-FR";

		renderCarousel({
			products: [makeProduct({ id: 3, title: "Velo" })],
		});

		expect(screen.getByRole("button", { name: "Ajouter" })).toBeInTheDocument();
	});

	it("disables cart actions on invalid session", async () => {
		mocks.callToolAsync.mockResolvedValueOnce({ isError: true });
		renderCarousel();

		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: "Add to cart" }));

		expect(await screen.findByText("Invalid cart session")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Add to cart" })).toBeDisabled();
		expect(screen.getByRole("button", { name: /🛒/ })).toBeDisabled();
	});

	it("calls cart tool with expected args", async () => {
		const initialSessionId = "123e4567-e89b-12d3-a456-426614174000";
		mocks.widgetState = {
			ids: [],
			sessionId: initialSessionId,
		};
		mocks.callToolAsync.mockResolvedValueOnce({
			isError: false,
			structuredContent: {
				sessionId: initialSessionId,
			},
		});
		renderCarousel();

		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: "Add to cart" }));

		expect(mocks.callToolAsync).toHaveBeenCalledWith({
			action: "add",
			productId: 1,
			sessionId: initialSessionId,
		});

		await user.click(await screen.findByRole("button", { name: "Remove" }));

		expect(mocks.callToolAsync).toHaveBeenNthCalledWith(2, {
			action: "remove",
			productId: 1,
			sessionId: initialSessionId,
		});
	});
});
