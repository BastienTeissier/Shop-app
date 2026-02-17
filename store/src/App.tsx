import { Route, Routes } from "react-router-dom";
import { CartIndicator } from "./components/CartIndicator";
import { CartProvider } from "./context/CartContext";
import { CartPage } from "./pages/CartPage";

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
