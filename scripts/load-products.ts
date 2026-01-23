import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

type ProductInput = {
	title: string;
	description: string;
	image: string;
	price: number;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const inputPath = process.argv[2]
	? path.resolve(process.argv[2])
	: path.join(rootDir, "products.json");
const dbPath = path.join(rootDir, "shop.db");

function warnInvalid(index: number, message: string): void {
	console.warn(`Skipping product at index ${index}: ${message}`);
}

function normalizeProduct(raw: unknown, index: number): ProductInput | null {
	if (!raw || typeof raw !== "object") {
		warnInvalid(index, "expected an object");
		return null;
	}

	const candidate = raw as Record<string, unknown>;
	const title =
		typeof candidate.title === "string" ? candidate.title.trim() : "";
	const description =
		typeof candidate.description === "string"
			? candidate.description.trim()
			: "";
	const image =
		typeof candidate.image === "string" ? candidate.image.trim() : "";
	const price = candidate.price;

	if (!title) {
		warnInvalid(index, "missing title");
		return null;
	}
	if (!description) {
		warnInvalid(index, "missing description");
		return null;
	}
	if (!image) {
		warnInvalid(index, "missing image");
		return null;
	}
	if (typeof price !== "number" || !Number.isInteger(price) || price < 0) {
		warnInvalid(index, "price must be a non-negative integer");
		return null;
	}

	return { title, description, image, price };
}

if (!fs.existsSync(inputPath)) {
	console.error(`Products file not found at ${inputPath}`);
	process.exit(1);
}

const rawContent = fs.readFileSync(inputPath, "utf8");
let parsed: unknown;

try {
	parsed = JSON.parse(rawContent);
} catch (error) {
	console.error("Failed to parse products JSON:", error);
	process.exit(1);
}

if (!Array.isArray(parsed)) {
	console.error("Products JSON must be an array.");
	process.exit(1);
}

const validProducts: ProductInput[] = [];
let skipped = 0;

parsed.forEach((item, index) => {
	const normalized = normalizeProduct(item, index);
	if (!normalized) {
		skipped += 1;
		return;
	}
	validProducts.push(normalized);
});

if (validProducts.length === 0) {
	console.log("No valid products to insert.");
	process.exit(0);
}

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const sqlite = new DatabaseSync(dbPath);
sqlite.exec("PRAGMA journal_mode = WAL");
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    image_url TEXT NOT NULL,
    price INTEGER NOT NULL
  )
`);

const insertStmt = sqlite.prepare(
	`
    INSERT INTO products (title, description, image_url, price)
    VALUES (@title, @description, @image, @price)
  `,
);

let inserted = 0;

try {
	sqlite.exec("BEGIN");
	for (const product of validProducts) {
		insertStmt.run(product);
		inserted += 1;
	}
	sqlite.exec("COMMIT");
} catch (error) {
	sqlite.exec("ROLLBACK");
	console.error("Failed to insert products:", error);
	process.exit(1);
} finally {
	try {
		sqlite.close();
	} catch {
		// ignore close errors
	}
}

console.log(`Inserted ${inserted} products. Skipped ${skipped}.`);
