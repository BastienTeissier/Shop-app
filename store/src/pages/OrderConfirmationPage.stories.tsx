import type { OrderApiResponse } from "@shared/types.js";
import type { Meta, StoryObj } from "@storybook/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { MockCartProvider } from "../../.storybook/mocks/CartContext.js";
import { OrderConfirmationPage } from "./OrderConfirmationPage.js";

const SAMPLE_ORDER: OrderApiResponse = {
	notFound: false,
	reference: "ORD-ABC123",
	customerName: "Jane Doe",
	customerEmail: "jane@example.com",
	items: [
		{
			productId: 1,
			title: "Running Shoes",
			imageUrl: "https://placehold.co/80x80?text=Shoes",
			unitPrice: 9999,
			quantity: 2,
			lineTotal: 19998,
		},
		{
			productId: 2,
			title: "Running Socks",
			imageUrl: "https://placehold.co/80x80?text=Socks",
			unitPrice: 1499,
			quantity: 1,
			lineTotal: 1499,
		},
	],
	totalPrice: 21497,
	createdAt: "2026-03-01T12:00:00Z",
};

function jsonResponse(data: unknown): Response {
	return new Response(JSON.stringify(data), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
}

function withOrderRoute(mockResponse: () => Promise<Response>) {
	return (Story: () => React.JSX.Element) => {
		window.fetch = () => mockResponse();
		return (
			<MemoryRouter initialEntries={["/orders/ORD-ABC123"]}>
				<MockCartProvider>
					<Routes>
						<Route path="/orders/:reference" element={<Story />} />
					</Routes>
				</MockCartProvider>
			</MemoryRouter>
		);
	};
}

const meta: Meta<typeof OrderConfirmationPage> = {
	title: "Pages/OrderConfirmationPage",
	component: OrderConfirmationPage,
};

export default meta;
type Story = StoryObj<typeof OrderConfirmationPage>;

export const Default: Story = {
	decorators: [
		withOrderRoute(() => Promise.resolve(jsonResponse(SAMPLE_ORDER))),
	],
};

export const Loading: Story = {
	decorators: [withOrderRoute(() => new Promise(() => {}))],
};

export const NotFound: Story = {
	decorators: [
		withOrderRoute(() => Promise.resolve(jsonResponse({ notFound: true }))),
	],
};
