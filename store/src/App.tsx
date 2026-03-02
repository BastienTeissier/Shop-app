import { Route, Routes } from "react-router-dom";
import { CartIndicator } from "./components/CartIndicator.js";
import { CartProvider } from "./context/CartContext.js";
import { CartPage } from "./pages/CartPage.js";
import { CheckoutPage } from "./pages/CheckoutPage.js";
import { HomePage } from "./pages/HomePage.js";
import { OrderConfirmationPage } from "./pages/OrderConfirmationPage.js";
import { ProductDetailPage } from "./pages/ProductDetailPage.js";

export function App() {
	return (
		<CartProvider>
			<CartIndicator />
			<Routes>
				<Route path="/" element={<HomePage />} />
				<Route path="/products/:id" element={<ProductDetailPage />} />
				<Route path="/cart" element={<CartPage />} />
				<Route path="/checkout" element={<CheckoutPage />} />
				<Route path="/orders/:reference" element={<OrderConfirmationPage />} />
			</Routes>
		</CartProvider>
	);
}
