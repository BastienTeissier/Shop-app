# PRD: Standalone Storefront App

## Commitment

### Features

- Standalone React app (separate Vite project) serving as a full e-commerce storefront
- Shared cart between the ChatGPT widget and the storefront via session-based URL parameter
- Product browsing powered by the existing recommendation agent (A2UI SSE stream)
- Order capture (name + email) persisted to the database
- Fully anonymous / session-based, no user accounts

### Technical Details *(Optional)*

- Separate Vite app in `store/` directory, deployed independently
- Connects to the existing Express API via HTTP (CORS already configured)
- Reuses the A2UI streaming protocol (SSE) for product search and recommendations
- Exposes REST API endpoints for cart and order operations (consumed by the storefront app)
- Session sharing via URL query parameter (`?session=<uuid>`)
- New `Order` Prisma model required for order persistence
- Mirror the widget's carousel/card layout adapted for a full-page experience

---

## Functional Specification

> **User Flow Slicing:** This feature is broken down into the following user flows.
> Each flow represents an independent, deliverable unit of functionality.

### User Flows

#### UF1: Widget Redirect to Cart View

**Context:** User has built a cart in the ChatGPT widget and clicks a "Checkout" button to continue on the standalone storefront.

AAU (anonymous), when I click the "Checkout" button in the ChatGPT ecom-carousel widget, I see/can:

- The widget opens a new browser tab/window to the storefront URL with my session ID as a query parameter (e.g., `https://store.example.com/cart?session=abc-123`)
- I land on a **read-only cart page** displaying:
  - List of cart items (product image, title, unit price, quantity, line total)
  - Cart total (total quantity, total price)
- No edit or interaction is available on this page (no add/remove buttons)
- The page uses the existing `cartGetSummary` data (title, image, price, quantity)

**Success scenario:**

- AAU, when my cart has items, I see all items listed with correct prices and quantities

**Error scenario:**

- AAU, if the session ID is invalid or expired, I see a message "Cart not found" with a link to browse the store
- AAU, if the cart is empty, I see a message "Your cart is empty" with a link to browse the store

**Edge cases:**

- AAU, if a product in my cart has been removed from the catalog, I still see it with its snapshot price and title

---

#### UF2: Cart Management

**Context:** User is on the storefront and wants to modify their cart contents.

AAU (anonymous), when I interact with products or my cart, I see/can:

- An "Add to cart" button on each product card
- When I click "Add to cart", the item is added to my cart (or quantity incremented if already present)
- A persistent cart indicator visible on all pages showing total quantity and total price
- When I click the cart indicator, I navigate to the cart page
- On the cart page, I can:
  - See all items (product image, title, unit price, quantity, line total)
  - Increment or decrement quantity for each item
  - Remove an item entirely
  - See the updated cart total after each change
- A "Proceed to checkout" button that navigates to the order submission page

**Success scenario:**

- AAU, when I add a product, the cart indicator updates immediately (optimistic update)
- AAU, when I modify quantities, the line totals and cart total recalculate

**Error scenario:**

- AAU, if a cart mutation fails (server error), the change is rolled back and I see a brief error message

**Edge cases:**

- AAU, if I decrement quantity to 0, the item is removed from the cart

---

#### UF3: Order Submission

**Context:** User has reviewed their cart and wants to place an order.

AAU (anonymous), when I click "Proceed to checkout" from the cart page, I see/can:

- An order review section showing all cart items (image, title, quantity, unit price, line total) and the order total
- A form with two required fields:
  - **Name** (text, required, max 255 characters)
  - **Email** (email format, required, max 255 characters)
- A "Place Order" button (disabled until both fields are valid)
- When I click "Place Order":
  - The order is submitted and persisted to the database
  - The cart is cleared
  - I see an order confirmation page with:
    - A confirmation message ("Order placed successfully")
    - An order reference number
    - A summary of what was ordered
    - A "Continue shopping" link back to the product browsing page

**Success scenario:**

- AAU, when I submit a valid order, I see the confirmation page within a few seconds

**Error scenario:**

- AAU, if the submission fails (server error), I stay on the form with my data preserved and see an error message "Something went wrong. Please try again."
- AAU, if my cart is empty when I try to submit, I see "Your cart is empty" and cannot place the order

**Edge cases:**

- AAU, if I refresh the confirmation page, I still see my order details (not a re-submission)
- AAU, if I navigate back after placing an order, my cart is empty

---

#### UF4: Product Browsing

**Context:** User is on the storefront and wants to discover and explore products.

AAU (anonymous), when I visit the storefront homepage, I see/can:

- A search bar at the top of the page
- A product grid displaying products organized into three tiers (mirroring the widget's carousel/card layout):
  - **Essential**: Must-have items for the activity
  - **Recommended**: Strongly suggested items
  - **Optional**: Nice-to-have extras
- Each product card displays:
  - Product image
  - Product title
  - Product price
  - "Add to cart" button
- Default products loaded on page load (popular products via the recommendation agent)
- When I type a search query and submit:
  - The product grid updates in real-time via the A2UI SSE stream
  - I see a loading/progress indicator while the recommendation agent processes
  - Results replace the current grid
- When I click a product card, I see a detail view with:
  - Larger product image
  - Full title and description
  - Price
  - "Add to cart" button

**Success scenario:**

- AAU, when I search for "running shoes", I see relevant products streamed in real-time as the agent finds them

**Error scenario:**

- AAU, if the SSE connection drops, I see a message "Connection lost" with a "Reconnect" button
- AAU, if the search returns no results, I see "No products found" with a suggestion to try different terms

**Edge cases:**

- AAU, if I submit a new search while a previous one is still streaming, the previous results are replaced by the new search

---

#### UF5: Independent Store Access

**Context:** User visits the storefront directly (not from ChatGPT) and uses it as a standalone e-commerce site.

AAU (anonymous), when I visit the storefront URL directly (without a `?session=` parameter), I see/can:

- The storefront homepage with product browsing (UF4)
- A fresh session is created automatically in the background
- I can browse products, add to cart (UF2), and proceed to checkout (UF3)
- The full experience works end-to-end without any ChatGPT interaction

**Success scenario:**

- AAU, when I visit the store for the first time, I get a seamless experience with a new session created transparently

**Edge cases:**

- AAU, if I visit with an invalid `?session=` value, cart actions are disabled but I can browse products; a message indicates the cart could not be loaded
- AAU, if I open the store in multiple tabs, each tab shares the same session (via sessionId stored in URL or browser state)

---

### Logging & Audit

- Orders are persisted with timestamp, session ID, customer name, email, and line items
- Cart mutations are handled by the existing cart API (no additional logging needed)

---

### Rights & Permissions

| Permission | Description | User Roles |
|---|---|---|
| Browse products | View product catalog and search | All visitors (anonymous) |
| Manage cart | Add, remove, update cart items | All visitors (anonymous) |
| Place order | Submit an order with name and email | All visitors (anonymous) |

---

## Out of Scope

- User accounts and authentication
- Payment processing (Stripe or other payment gateways)
- Order management / admin panel
- Order status tracking or email notifications
- Inventory management or stock limits
- Product reviews or ratings
- Wishlist functionality
- Multiple shipping addresses
- Discount codes or promotions

---

## Acceptance Criteria

- [ ] ChatGPT widget "Checkout" button redirects to the storefront with `?session=<id>`
- [ ] Storefront loads and displays the correct cart from the session ID
- [ ] Read-only cart page displays all items with correct prices and quantities
- [ ] Users can add/remove products and update quantities from the storefront
- [ ] Cart indicator is visible on all pages with correct totals
- [ ] Product search uses the existing A2UI recommendation agent via SSE
- [ ] Product grid updates in real-time as search results stream in
- [ ] Order form validates name (required, max 255) and email (required, valid format, max 255)
- [ ] Submitted orders are persisted to the database with all line items
- [ ] Order confirmation page displays reference number and summary
- [ ] Cart is cleared after successful order submission
- [ ] Store works independently without a ChatGPT session
- [ ] Missing session parameter creates a fresh session; invalid session disables cart actions but allows browsing
- [ ] Product grid displays recommendations organized into Essential, Recommended, and Optional tiers
