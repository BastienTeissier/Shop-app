# PRD: Cart
## Commitment
### Features
- Persist an anonymous cart in the database keyed by `sessionId` (UUID) so it can be reused across interfaces.
- Create a cart session on first tool call when no `sessionId` is provided.
- Support add/remove in the product carousel with optimistic UI updates and server reconciliation.
- Display a read-only cart summary in a dedicated cart widget.
- Snapshot item price at add time and show a subtotal only.
### Technical Details *(Optional)*
- `sessionId` is passed in the tool call; if missing, the MCP server generates one and returns it to the widget for reuse in subsequent tool calls.
- Cart does not expire.
- Reconciliation mismatch shows an auto-dismissing banner: "An error occur while updating your cart" while silently correcting state.
- Invalid `sessionId` disables cart actions but allows browsing products.
---
## Functional Specification
> **User Flow Slicing:** This feature is broken down into the following user flows.
> Each flow represents an independent, deliverable unit of functionality.
### User Flows
#### UF1: Initialize Anonymous Cart Session
**Context:** User opens the product carousel or cart widget, and may or may not have a `sessionId`.
AAU (anonymous), when the widget is first invoked without a `sessionId`, I see:
- A cart session created in the database
- A generated `sessionId` returned to the widget for reuse
- An empty cart state
AAU (anonymous), when I provide a valid `sessionId`, I can:
- Reuse the existing cart session
**Success scenario:** *(Optional)*
- AAU, when no `sessionId` exists, I receive a new `sessionId` and an empty cart is created
**Error scenario:** *(Optional)*
- AAU, when `sessionId` is missing or invalid (non-UUID), I see an error message and cart actions are disabled while product browsing remains available
**Edge cases:** *(Optional)*
- AAU, if the cart cannot be created, I see an empty cart and cart actions remain disabled
---
#### UF2: Manage Cart from Product Carousel
**Context:** User is browsing products in the carousel with a valid `sessionId`.
AAU (anonymous), when I click **Add to cart**, I see/can:
- The product appear in the cart immediately (optimistic update)
- The item quantity increment if it is already in the cart
- The cart indicator count update
AAU (anonymous), when I click **Remove**, I see/can:
- The entire line removed from the cart
- The cart indicator count update
**Success scenario:** *(Optional)*
- AAU, after the server responds, the cart state matches the database without interrupting my flow
**Error scenario:** *(Optional)*
- AAU, if the server response disagrees with the optimistic state or the update fails, I see a banner "An error occur while updating your cart" and the cart silently corrects to the database state
**Edge cases:** *(Optional)*
- AAU, if loading the cart from the database fails, I see an empty cart state; add/remove actions still follow the optimistic + reconciliation behavior
---
#### UF3: View Cart Summary in Cart Widget
**Context:** User opens the dedicated cart widget with a valid `sessionId`.
AAU (anonymous), when I open the cart widget, I see/can:
- A read-only list of cart items with title, image, unit price (snapshotted), quantity, and line total
- A subtotal (sum of line totals)
**Success scenario:** *(Optional)*
- AAU, when a valid `sessionId` is provided, I see the current cart summary from the database
**Error scenario:** *(Optional)*
- AAU, if the cart cannot be loaded, I see an empty cart summary
**Edge cases:** *(Optional)*
- AAU, if the cart is empty, I see an empty cart state with no subtotal
---
### Logging & Audit
- Cart session creation (timestamp, generated `sessionId`)
- Cart item added/removed (product ID, quantity change, snapshot price)
- Cart reconciliation corrections (optimistic vs. database state)
- Invalid `sessionId` attempts
---
### Rights & Permissions
| Permission | Description | User Roles |
|------------|-------------|------------|
| cart:read | View cart by `sessionId` | Anonymous session |
| cart:write | Add/remove items by `sessionId` | Anonymous session |
---

## Out of Scope
- Clear cart functionality
- Authenticated carts or user accounts
- Checkout or payment flow
- Taxes, shipping, discounts, or promotions
- Quantity editing controls in the cart widget
- Cart expiration or cleanup policy
---
## Acceptance Criteria (Optional)
- [ ] If `sessionId` is missing, the server creates a cart and returns a new UUID
- [ ] Invalid `sessionId` blocks cart actions but allows product browsing with an error message
- [ ] Add to cart increments quantity; remove deletes the entire line
- [ ] Carousel updates optimistically and reconciles with the DB response
- [ ] Reconciliation mismatch shows the specified auto-dismissing banner
- [ ] Cart widget shows a read-only summary with snapshot price and subtotal
- [ ] Cart load failure results in an empty cart display
