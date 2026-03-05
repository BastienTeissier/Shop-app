import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CartSummaryItem } from "@shared/types.js";

import { makeCartSummaryItem } from "../test/factories";
import { CartSummary } from "./cart-summary";

const mocks = vi.hoisted(() => ({
	theme: "light",
	useToolInfo: vi.fn(),
}));

vi.mock("skybridge/web", () => ({
	useLayout: vi.fn(() => ({ theme: mocks.theme })),
}));

vi.mock("../helpers.js", () => ({
	useToolInfo: mocks.useToolInfo,
}));

const renderSummary = (options?: {
	items?: CartSummaryItem[];
	subtotal?: number;
	isPending?: boolean;
}) => {
	const { items = [], subtotal = 0, isPending = false } = options ?? {};
	const output =
		items.length > 0 || subtotal > 0 ? { items, subtotal } : undefined;
	mocks.useToolInfo.mockReturnValue({ output, isPending });
	return render(<CartSummary />);
};

describe("CartSummary", () => {
	beforeEach(() => {
		mocks.theme = "light";
		mocks.useToolInfo.mockReset();
	});

	it("renders items and subtotal", () => {
		const items = [
			makeCartSummaryItem({
				productId: 1,
				title: "Road Bike",
				unitPriceSnapshot: 1999,
				lineTotal: 1999,
			}),
			makeCartSummaryItem({
				productId: 2,
				title: "Helmet",
				unitPriceSnapshot: 499,
				quantity: 2,
				lineTotal: 998,
				imageUrl: "https://example.com/helmet.png",
			}),
		];
		renderSummary({ items, subtotal: 2997 });

		// Check titles are rendered
		expect(screen.getByText("Road Bike")).toBeInTheDocument();
		expect(screen.getByText("Helmet")).toBeInTheDocument();

		// Check quantity multiplier is shown for qty > 1 (text is part of price element)
		expect(screen.getByText(/× 2/)).toBeInTheDocument();

		// Check subtotal section
		expect(screen.getByText("Subtotal")).toBeInTheDocument();
		expect(screen.getByText("$29.97")).toBeInTheDocument();

		// Check images are rendered
		expect(screen.getByAltText("Road Bike")).toHaveAttribute(
			"src",
			"https://example.com/road-bike.png",
		);
		expect(screen.getByAltText("Helmet")).toHaveAttribute(
			"src",
			"https://example.com/helmet.png",
		);
	});

	it("renders empty list and no subtotal on empty cart", () => {
		mocks.useToolInfo.mockReturnValue({
			output: { items: [], subtotal: 0 },
			isPending: false,
		});
		const { container } = render(<CartSummary />);

		// Should render empty summary-list div
		const summaryList = container.querySelector(".summary-list");
		expect(summaryList).toBeInTheDocument();
		expect(summaryList?.children.length).toBe(0);

		// Should not render subtotal
		expect(screen.queryByText("Subtotal")).not.toBeInTheDocument();
	});

	it("renders empty list when output is undefined (error case)", () => {
		mocks.useToolInfo.mockReturnValue({
			output: undefined,
			isPending: false,
		});
		const { container } = render(<CartSummary />);

		// Should render empty summary-list div
		const summaryList = container.querySelector(".summary-list");
		expect(summaryList).toBeInTheDocument();
		expect(summaryList?.children.length).toBe(0);

		// Should not render subtotal
		expect(screen.queryByText("Subtotal")).not.toBeInTheDocument();
	});

	it("renders empty container when pending", () => {
		mocks.useToolInfo.mockReturnValue({
			output: undefined,
			isPending: true,
		});
		const { container } = render(<CartSummary />);

		// Should render container but no content
		expect(container.querySelector(".container")).toBeInTheDocument();
		expect(screen.queryByText("Subtotal")).not.toBeInTheDocument();
	});
});
