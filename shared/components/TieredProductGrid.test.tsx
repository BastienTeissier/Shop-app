import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TieredProductGrid } from "./TieredProductGrid.js";

type TestProduct = {
	id: number;
	name: string;
	tier?: string;
};

function renderGrid(products: TestProduct[], emptyMessage?: string) {
	return render(
		<TieredProductGrid
			products={products}
			renderProduct={(p) => <div key={p.id}>{p.name}</div>}
			emptyMessage={emptyMessage}
		/>,
	);
}

describe("TieredProductGrid", () => {
	it("groups products by tier with correct section headers", () => {
		renderGrid([
			{ id: 1, name: "Item A", tier: "essential" },
			{ id: 2, name: "Item B", tier: "recommended" },
			{ id: 3, name: "Item C", tier: "optional" },
		]);

		expect(screen.getByText("Essential")).toBeInTheDocument();
		expect(screen.getByText("Recommended")).toBeInTheDocument();
		expect(screen.getByText("Optional")).toBeInTheDocument();
	});

	it("sorts tiers: essential -> recommended -> optional", () => {
		renderGrid([
			{ id: 1, name: "Item A", tier: "optional" },
			{ id: 2, name: "Item B", tier: "essential" },
			{ id: 3, name: "Item C", tier: "recommended" },
		]);

		const labels = screen.getAllByText(/Essential|Recommended|Optional/);
		expect(labels[0]).toHaveTextContent("Essential");
		expect(labels[1]).toHaveTextContent("Recommended");
		expect(labels[2]).toHaveTextContent("Optional");
	});

	it("defaults to recommended tier when tier is undefined", () => {
		renderGrid([{ id: 1, name: "No Tier Item" }]);

		expect(screen.getByText("Recommended")).toBeInTheDocument();
		expect(screen.getByText("No Tier Item")).toBeInTheDocument();
	});

	it("renders empty message when no products", () => {
		renderGrid([], "No products found");

		expect(screen.getByText("No products found")).toBeInTheDocument();
	});
});
