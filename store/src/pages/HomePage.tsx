import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ProductCard } from "@shared/components/ProductCard.js";
import { TieredProductGrid } from "@shared/components/TieredProductGrid.js";

import { useCart } from "../context/CartContext.js";
import { useRecommendations } from "../hooks/useRecommendations.js";
import { useSuggestions } from "../hooks/useSuggestions.js";

const PROMPT_BUTTONS = [
	"Running gear",
	"Ski equipment",
	"Hiking essentials",
	"Beach gear",
	"Cycling setup",
];

export function HomePage() {
	const navigate = useNavigate();
	const { addItem } = useCart();
	const {
		products,
		status,
		suggestions,
		connected,
		error,
		search,
		refine,
		reconnect,
	} = useRecommendations();
	const { chips, isVisible } = useSuggestions(suggestions);

	const [query, setQuery] = useState("");
	const [hasSearched, setHasSearched] = useState(false);

	function handleSearch(searchQuery: string) {
		const trimmed = searchQuery.trim();
		if (!trimmed) return;
		setQuery(trimmed);
		setHasSearched(true);
		search(trimmed);
	}

	function handleChipClick(chipLabel: string) {
		const combined = `${query} ${chipLabel}`.trim();
		setQuery(combined);
		setHasSearched(true);
		refine(combined);
	}

	function handleSubmit(e: FormEvent) {
		e.preventDefault();
		handleSearch(query);
	}

	const isSearching =
		status.phase === "searching" || status.phase === "ranking";
	const isCompleted = status.phase === "completed";
	const showGrid = hasSearched;
	const showEmpty =
		hasSearched && isCompleted && products.length === 0 && connected;
	const showDisconnected = hasSearched && !connected && error;

	return (
		<div className="page-container">
			<h1 className="page-title">Find your gear</h1>

			<form className="search-bar" onSubmit={handleSubmit}>
				<input
					type="text"
					className="search-input"
					placeholder="Search for products..."
					value={query}
					onChange={(e) => setQuery(e.target.value)}
				/>
				<button type="submit" className="search-btn">
					Search
				</button>
			</form>

			<div className="prompt-buttons">
				{PROMPT_BUTTONS.map((prompt) => (
					<button
						key={prompt}
						type="button"
						className="prompt-btn"
						onClick={() => {
							setQuery(prompt);
							handleSearch(prompt);
						}}
					>
						{prompt}
					</button>
				))}
			</div>

			{chips.length > 0 && (
				<div className={`suggestion-chips ${isVisible ? "visible" : ""}`}>
					{chips.map((chip) => (
						<button
							key={chip.label}
							type="button"
							className="suggestion-chip"
							onClick={() => handleChipClick(chip.label)}
						>
							{chip.label}
						</button>
					))}
				</div>
			)}

			{isSearching && (
				<div className="status-message">{status.message || "Searching..."}</div>
			)}

			{showDisconnected && (
				<div className="connection-error">
					<p>{error}</p>
					<button type="button" className="reconnect-btn" onClick={reconnect}>
						Reconnect
					</button>
				</div>
			)}

			{showEmpty && (
				<div className="status-message">
					No products found. Try different search terms.
				</div>
			)}

			{showGrid && products.length > 0 && (
				<TieredProductGrid
					products={products}
					className="product-grid"
					renderProduct={(product) => (
						<ProductCard
							key={product.id}
							product={product}
							onCardClick={() =>
								navigate(`/products/${product.id}`, {
									state: { product },
								})
							}
							onAddToCart={() => addItem(product.id)}
						/>
					)}
				/>
			)}
		</div>
	);
}
