import type { Meta, StoryObj } from "@storybook/react";
import { MemoryRouter } from "react-router-dom";
import { MockCartProvider } from "../../.storybook/mocks/CartContext.js";
import { CheckoutPage } from "./CheckoutPage.js";

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

const meta: Meta<typeof CheckoutPage> = {
	title: "Pages/CheckoutPage",
	component: CheckoutPage,
};

export default meta;
type Story = StoryObj<typeof CheckoutPage>;

export const Default: Story = {
	decorators: [
		(Story) => (
			<MemoryRouter initialEntries={["/checkout?session=test"]}>
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
			<MemoryRouter initialEntries={["/checkout?session=test"]}>
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
			<MemoryRouter initialEntries={["/checkout?session=test"]}>
				<MockCartProvider loading={true} sessionId="test">
					<Story />
				</MockCartProvider>
			</MemoryRouter>
		),
	],
};

export const SubmitError: Story = {
	args: {
		initialError: "Something went wrong. Please try again.",
	},
	decorators: [
		(Story) => (
			<MemoryRouter initialEntries={["/checkout?session=test"]}>
				<MockCartProvider cart={SAMPLE_CART} sessionId="test" totalQuantity={3}>
					<Story />
				</MockCartProvider>
			</MemoryRouter>
		),
	],
};
