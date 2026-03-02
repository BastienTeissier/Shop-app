import type { Meta, StoryObj } from "@storybook/react";
import { MemoryRouter } from "react-router-dom";

import { MockCartProvider } from "../../.storybook/mocks/CartContext.js";
import { CartPage } from "./CartPage.js";

const SAMPLE_CART = {
	items: [
		{
			productId: 1,
			title: "Running Shoes",
			imageUrl: "https://placehold.co/80x80?text=Shoes",
			unitPriceSnapshot: 9999,
			quantity: 2,
			lineTotal: 19998,
		},
		{
			productId: 2,
			title: "Running Socks",
			imageUrl: "https://placehold.co/80x80?text=Socks",
			unitPriceSnapshot: 1499,
			quantity: 1,
			lineTotal: 1499,
		},
	],
	subtotal: 21497,
};

const meta: Meta<typeof CartPage> = {
	title: "Pages/CartPage",
	component: CartPage,
};

export default meta;
type Story = StoryObj<typeof CartPage>;

export const WithItems: Story = {
	decorators: [
		(Story) => (
			<MemoryRouter initialEntries={["/cart?session=test"]}>
				<MockCartProvider cart={SAMPLE_CART} sessionId="test" totalQuantity={3}>
					<Story />
				</MockCartProvider>
			</MemoryRouter>
		),
	],
};

export const Empty: Story = {
	decorators: [
		(Story) => (
			<MemoryRouter initialEntries={["/cart?session=test"]}>
				<MockCartProvider cart={{ items: [], subtotal: 0 }} sessionId="test">
					<Story />
				</MockCartProvider>
			</MemoryRouter>
		),
	],
};

export const Loading: Story = {
	decorators: [
		(Story) => (
			<MemoryRouter initialEntries={["/cart?session=test"]}>
				<MockCartProvider loading={true} sessionId="test">
					<Story />
				</MockCartProvider>
			</MemoryRouter>
		),
	],
};

export const NotFound: Story = {
	decorators: [
		(Story) => (
			<MemoryRouter initialEntries={["/cart?session=test"]}>
				<MockCartProvider notFound={true} sessionId="test">
					<Story />
				</MockCartProvider>
			</MemoryRouter>
		),
	],
};

export const ErrorState: Story = {
	decorators: [
		(Story) => (
			<MemoryRouter initialEntries={["/cart?session=test"]}>
				<MockCartProvider error="Network error" sessionId="test">
					<Story />
				</MockCartProvider>
			</MemoryRouter>
		),
	],
};

export const ErrorWithCart: Story = {
	decorators: [
		(Story) => (
			<MemoryRouter initialEntries={["/cart?session=test"]}>
				<MockCartProvider
					cart={SAMPLE_CART}
					sessionId="test"
					totalQuantity={3}
					error="Failed to update quantity"
				>
					<Story />
				</MockCartProvider>
			</MemoryRouter>
		),
	],
};
