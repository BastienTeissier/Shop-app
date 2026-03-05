import type { Meta, StoryObj } from "@storybook/react";
import { MemoryRouter } from "react-router-dom";

import { MockCartProvider } from "../../.storybook/mocks/CartContext.js";
import { CartIndicator } from "./CartIndicator.js";

const meta: Meta<typeof CartIndicator> = {
	title: "Components/CartIndicator",
	component: CartIndicator,
};

export default meta;
type Story = StoryObj<typeof CartIndicator>;

export const WithItems: Story = {
	decorators: [
		(Story) => (
			<MemoryRouter>
				<MockCartProvider
					cart={{
						items: [
							{
								productId: 1,
								title: "Running Shoes",
								imageUrl: "https://placehold.co/80x80?text=Shoes",
								unitPriceSnapshot: 1999,
								quantity: 2,
								lineTotal: 3998,
							},
							{
								productId: 2,
								title: "Running Socks",
								imageUrl: "https://placehold.co/80x80?text=Socks",
								unitPriceSnapshot: 999,
								quantity: 1,
								lineTotal: 999,
							},
						],
						subtotal: 5997,
					}}
					sessionId="test-session"
					totalQuantity={3}
				>
					<Story />
				</MockCartProvider>
			</MemoryRouter>
		),
	],
};

export const SingleItem: Story = {
	decorators: [
		(Story) => (
			<MemoryRouter>
				<MockCartProvider
					cart={{
						items: [
							{
								productId: 1,
								title: "Running Shoes",
								imageUrl: "https://placehold.co/80x80?text=Shoes",
								unitPriceSnapshot: 1999,
								quantity: 1,
								lineTotal: 1999,
							},
						],
						subtotal: 1999,
					}}
					sessionId="test-session"
					totalQuantity={1}
				>
					<Story />
				</MockCartProvider>
			</MemoryRouter>
		),
	],
};

export const WithError: Story = {
	decorators: [
		(Story) => (
			<MemoryRouter>
				<MockCartProvider
					cart={{
						items: [
							{
								productId: 1,
								title: "Running Shoes",
								imageUrl: "https://placehold.co/80x80?text=Shoes",
								unitPriceSnapshot: 1999,
								quantity: 1,
								lineTotal: 1999,
							},
						],
						subtotal: 1999,
					}}
					sessionId="test-session"
					totalQuantity={1}
					error="Failed to update quantity"
				>
					<Story />
				</MockCartProvider>
			</MemoryRouter>
		),
	],
};
