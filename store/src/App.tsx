import { Route, Routes } from "react-router-dom";
import { CartIndicator } from "./components/CartIndicator.js";
import { CartProvider } from "./context/CartContext.js";
import { CartPage } from "./pages/CartPage.js";
import { CheckoutPage } from "./pages/CheckoutPage.js";
import { OrderConfirmationPage } from "./pages/OrderConfirmationPage.js";

export function App() {
	return (
		<CartProvider>
			<CartIndicator />
			<Routes>
				<Route path="/cart" element={<CartPage />} />
				<Route path="/checkout" element={<CheckoutPage />} />
				<Route path="/orders/:reference" element={<OrderConfirmationPage />} />
			</Routes>
		</CartProvider>
	);
}
