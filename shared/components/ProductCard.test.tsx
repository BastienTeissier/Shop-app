import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProductCard } from "./ProductCard.js";

const BASE_PRODUCT = {
	id: 1,
	title: "Trail Shoe",
	imageUrl: "https://example.com/shoe.png",
	price: 12999,
};

describe("ProductCard", () => {
	it("renders image, title, and formatted price", () => {
		render(<ProductCard product={BASE_PRODUCT} />);

		expect(screen.getByAltText("Trail Shoe")).toBeInTheDocument();
		expect(screen.getByText("Trail Shoe")).toBeInTheDocument();
		expect(screen.getByText("$129.99")).toBeInTheDocument();
	});

	it("truncates description over 100 chars", () => {
		const longDesc = "A".repeat(150);
		render(
			<ProductCard product={{ ...BASE_PRODUCT, description: longDesc }} />,
		);

		expect(screen.getByText(`${"A".repeat(100)}...`)).toBeInTheDocument();
	});

	it("calls onAddToCart on button click", async () => {
		const user = userEvent.setup();
		const onAddToCart = vi.fn();
		render(<ProductCard product={BASE_PRODUCT} onAddToCart={onAddToCart} />);

		await user.click(screen.getByText("Add to cart"));
		expect(onAddToCart).toHaveBeenCalledOnce();
	});

	it("calls onCardClick on card body click", async () => {
		const user = userEvent.setup();
		const onCardClick = vi.fn();
		render(<ProductCard product={BASE_PRODUCT} onCardClick={onCardClick} />);

		await user.click(screen.getByAltText("Trail Shoe"));
		expect(onCardClick).toHaveBeenCalledOnce();
	});

	it("renders highlights and reasonWhy tags", () => {
		render(
			<ProductCard
				product={{
					...BASE_PRODUCT,
					highlights: ["Waterproof"],
					reasonWhy: ["Great for trails"],
				}}
			/>,
		);

		expect(screen.getByText("Waterproof")).toBeInTheDocument();
		expect(screen.getByText("Great for trails")).toBeInTheDocument();
	});
});
