import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

export type Product = {
	id: number;
	title: string;
	description: string;
	imageUrl: string;
	price: number;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, "../../shop.db");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const sqlite = new DatabaseSync(DB_PATH);
sqlite.exec("PRAGMA journal_mode = WAL");
sqlite.exec("PRAGMA foreign_keys = ON");
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    image_url TEXT NOT NULL,
    price INTEGER NOT NULL
  )
`);

const searchProductsStmt = sqlite.prepare(
	`
    SELECT id, title, description, image_url as imageUrl, price
    FROM products
    WHERE title LIKE ? OR description LIKE ?
    ORDER BY id DESC
    LIMIT ?
  `,
);

function closeDatabase(): void {
	try {
		sqlite.close();
	} catch {
		/* ignore close errors */
	}
}

process.on("exit", closeDatabase);
process.on("SIGINT", closeDatabase);
process.on("SIGTERM", closeDatabase);

export async function listProducts(
	query: string,
	limit = 10,
): Promise<Product[]> {
	const trimmedQuery = query.trim();
	const safeLimit = Math.max(0, Math.floor(limit));

	if (!trimmedQuery || safeLimit === 0) {
		return [];
	}

	const pattern = `%${trimmedQuery}%`;
	const rows = searchProductsStmt.all(pattern, pattern, safeLimit) as Product[];

	return rows;
}
