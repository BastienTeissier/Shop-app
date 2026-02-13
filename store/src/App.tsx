import { Route, Routes } from "react-router-dom";
import { CartPage } from "./pages/CartPage";

export function App() {
	return (
		<Routes>
			<Route path="/cart" element={<CartPage />} />
		</Routes>
	);
}
