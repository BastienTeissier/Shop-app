import { Route, Routes } from "react-router-dom";
import { CartIndicator } from "./components/CartIndicator.js";
import { CartProvider } from "./context/CartContext.js";
import { CartPage } from "./pages/CartPage.js";

export function App() {
	return (
		<CartProvider>
			<CartIndicator />
			<Routes>
				<Route path="/cart" element={<CartPage />} />
			</Routes>
		</CartProvider>
	);
}
