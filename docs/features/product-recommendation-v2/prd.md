# PRD: Product Recommendation Widget Enhancement (v2)

## Commitment

### Features
- Launch product recommendations directly from tool input query (remove in-widget search field)
- Enforce sub-category diversity: maximum 1 product per sub-category across all recommendation tiers
- AI-inferred sub-categories from product title, description, and category data
- Maintain refinement capability with consistent diversity rules
- Show fewer products when insufficient unique sub-categories are available

### Technical Details *(Optional)*
- Initial query provided via tool invocation parameter (Skybridge tool input)
- Sub-category inference handled by recommendation agent during product selection
- Diversity filtering applied post-search, pre-rendering
- RefineInput component retained for follow-up adjustments
- InputRenderer component removed from widget surface

---

## Functional Specification

> **User Flow Slicing:** This feature is broken down into the following user flows.
> Each flow represents an independent, deliverable unit of functionality.

### User Flows

#### UF1: Request Recommendations via Tool Input

**Context:** User describes an activity or need in the main chat interface, invoking the recommendation tool with a query parameter. The widget opens with recommendations already loaded, enforcing sub-category diversity.

AAU (anonymous or authenticated), when I type a query in the main chat (e.g., "skiing gear", "beach vacation essentials") and the recommendation tool is invoked, I see:
- The recommendation widget opens immediately with products displayed
- No search field is visible within the widget
- Products are organized into three tiers: Essential, Recommended, Optional
- Each product displays: name, image, price, availability status
- Maximum 1 product per sub-category across all tiers (e.g., only one "jacket" type product even if multiple jacket varieties exist)
- Sub-categories are inferred by AI from product data (title, description, category)

AAU, when I invoke the tool without a query parameter (empty or missing), I see:
- A default prompt message: "What activity or gear are you looking for? Use the refine field to describe your needs."
- The RefineInput component is available to enter my initial query

AAU, when the AI identifies products but cannot find enough unique sub-categories, I see:
- Fewer products than typical (e.g., 4 products instead of 7)
- Each product belongs to a distinct sub-category
- No indication that products were filtered out (diversity filtering is invisible)

AAU (with purchase history), when I request recommendations, I see:
- Products personalized based on my past purchases and preferences
- Budget-appropriate options if I specified a budget
- Still respecting the 1-per-sub-category rule

**Success scenario:**
- AAU, when I ask "I need hiking gear" in chat, the widget opens within 3 seconds showing 5-8 products across tiers with no duplicate sub-categories

**Error scenario:**
- AAU, if the system cannot understand my activity, I see a message in the widget: "Could you describe what you're looking for?" with the RefineInput available
- AAU, if no products match my query, I see: "No recommendations found for '[query]'. Try describing a different activity or need."
- AAU, if the AI inference fails to categorize products, I see recommendations without diversity filtering applied (fallback behavior)

**Edge cases:**
- AAU, if only 1-2 products with unique sub-categories exist for my query, I see just those 1-2 products (not padded with duplicates)
- AAU, if all recommended products are out of stock, I still see them marked as "Unavailable"
- AAU, if I describe a very specific sub-category (e.g., "raincoats only"), the system may return fewer products due to diversity constraints
- AAU, if the AI cannot confidently infer sub-categories, it assigns generic categories and diversity filtering may be less effective

---

#### UF2: Refine Recommendations with Diversity

**Context:** User has received initial recommendations and wants to adjust them using the RefineInput component. Refinements maintain the same sub-category diversity rules.

AAU (anonymous or authenticated), after viewing my initial recommendations, when I use the RefineInput field to refine (e.g., "exclude jackets", "show under $100", "add beginner options"), I see:
- An updated recommendation reflecting my feedback
- Products re-organized or replaced based on my criteria
- Sub-category diversity still enforced (max 1 product per sub-category globally)
- If refinement reduces unique sub-categories available, fewer products are shown

AAU, when I refine with constraints that eliminate most products, I see:
- A smaller set of products (e.g., 2-3 instead of 7)
- Each product still belongs to a unique sub-category
- No error message if at least 1 product remains

AAU, when I refine with "I already have [item]", I see:
- That item's sub-category excluded from results
- Other products from different sub-categories fill the recommendation
- If excluding a sub-category leaves too few products, I see fewer recommendations

**Success scenario:**
- AAU, when I say "show budget options under $50", I see updated products all priced under $50 with maintained sub-category diversity

**Error scenario:**
- AAU, if my refinement request is unclear or ambiguous, I see a clarifying question: "Could you be more specific about how you'd like to adjust the recommendations?"
- AAU, if my refinement eliminates all products (e.g., "under $5" when no products exist), I see: "No products match your criteria. Try broadening your requirements."

**Edge cases:**
- AAU, if I exclude multiple sub-categories sequentially (e.g., "no jackets", then "no pants"), each refinement removes another sub-category and the list shrinks accordingly
- AAU, if I request alternatives for a specific tier (e.g., "different optional items"), the diversity rule applies to the newly generated list
- AAU, if I refine to add items (e.g., "also show accessories"), new products are added only if their sub-categories don't duplicate existing ones

---

### Logging & Audit

- Tool invocations with query parameter (query text, user ID if authenticated, timestamp)
- Sub-category inference results (product ID, inferred sub-category, confidence score if available)
- Diversity filtering actions (products excluded due to sub-category duplication, final product count)
- Refinement requests (original recommendation, refinement query, updated recommendation, products filtered)
- Failed recommendations (error type, query, reason for failure)
- Fallback activations (when diversity filtering is skipped due to inference failures)

---

### Rights & Permissions

| Permission | Description | User Roles |
|------------|-------------|------------|
| recommendation:request | Invoke tool with query to get recommendations | Anonymous, Customer, Sales Agent |
| recommendation:refine | Refine existing recommendations via RefineInput | Anonymous, Customer, Sales Agent |

---

## Out of Scope

- Manual sub-category assignment (sub-categories are always AI-inferred)
- User-configurable diversity rules (always max 1 per sub-category)
- Sub-category visibility in UI (users don't see how products are categorized)
- Per-tier diversity rules (diversity is global across all tiers)
- Saving or sharing refined recommendations
- Admin dashboard for sub-category management
- Sub-category data stored in database (inferred at request time)
- Ability to override diversity rules per query
- Sub-category explanations or hints to users

---

## Real World Test Scenarios

Detailed test scenarios with hypothetical product data and validation points can be found in:
**[scenarios.md](./scenarios.md)**

This includes:
- Test product catalog (skiing, hiking, running, beach categories)
- 12 test scenarios covering happy paths, edge cases, and refinements
- Validation points for sub-category diversity enforcement
- Test execution checklist

---

## Acceptance Criteria

- [ ] User can invoke recommendation tool from main chat with query parameter
- [ ] Widget opens without displaying a search field (InputRenderer removed)
- [ ] Recommendations enforce max 1 product per sub-category globally across all tiers
- [ ] Sub-categories are inferred by AI from product title, description, and category
- [ ] When insufficient unique sub-categories exist, fewer products are shown (no duplicates)
- [ ] Empty/missing query parameter shows default prompt with RefineInput available
- [ ] RefineInput component remains functional for adjusting recommendations
- [ ] Refinements maintain the same sub-category diversity rules
- [ ] Diversity filtering is invisible to users (no UI indication of filtered products)
- [ ] Out-of-stock products still appear with "Unavailable" status
- [ ] System gracefully handles AI inference failures (fallback: show recommendations without diversity)
- [ ] Personalization (history, budget) works alongside diversity filtering
- [ ] Vague queries trigger clarifying questions
- [ ] Extremely restrictive refinements show "No products match" message when appropriate
