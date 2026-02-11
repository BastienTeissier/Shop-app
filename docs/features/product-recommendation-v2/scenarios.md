# Real World Test Scenarios - Product Recommendation v2

This document defines concrete test scenarios with hypothetical product data to validate the sub-category diversity feature works as expected.

## Test Product Catalog

**Hypothetical products for testing:**

### Skiing Category
- **SKI-001:** "Alpine Pro Downhill Skis" - $450 - sub-category: `skis`
- **SKI-002:** "Rossignol All-Mountain Skis" - $380 - sub-category: `skis`
- **SKI-003:** "Salomon Ski Boots" - $320 - sub-category: `ski-boots`
- **SKI-004:** "Smith Ski Goggles" - $85 - sub-category: `ski-goggles`
- **SKI-005:** "Burton Insulated Ski Jacket" - $280 - sub-category: `ski-jacket`
- **SKI-006:** "Columbia Waterproof Ski Jacket" - $220 - sub-category: `ski-jacket`
- **SKI-007:** "The North Face Snow Pants" - $180 - sub-category: `ski-pants`
- **SKI-008:** "Dakine Ski Gloves" - $45 - sub-category: `ski-gloves`
- **SKI-009:** "Black Diamond Ski Poles" - $95 - sub-category: `ski-poles`

### Hiking Category
- **HIK-001:** "Merrell Moab Hiking Boots" - $140 - sub-category: `hiking-boots`
- **HIK-002:** "Salomon Trailblazer Hiking Boots" - $160 - sub-category: `hiking-boots`
- **HIK-003:** "Osprey Atmos 65L Backpack" - $290 - sub-category: `hiking-backpack`
- **HIK-004:** "Black Diamond Trekking Poles" - $120 - sub-category: `trekking-poles`
- **HIK-005:** "Patagonia Rain Jacket" - $200 - sub-category: `rain-jacket`
- **HIK-006:** "Arc'teryx Waterproof Shell" - $350 - sub-category: `rain-jacket`
- **HIK-007:** "CamelBak Hydration Pack 2L" - $65 - sub-category: `hydration-pack`
- **HIK-008:** "REI Trail Pants" - $75 - sub-category: `hiking-pants`
- **HIK-009:** "Smartwool Hiking Socks" - $22 - sub-category: `hiking-socks`

### Running Category
- **RUN-001:** "Nike Pegasus Running Shoes" - $130 - sub-category: `running-shoes`
- **RUN-002:** "Adidas Ultraboost Runners" - $180 - sub-category: `running-shoes`
- **RUN-003:** "Garmin Forerunner GPS Watch" - $250 - sub-category: `gps-watch`
- **RUN-004:** "Under Armour Running Shorts" - $35 - sub-category: `running-shorts`
- **RUN-005:** "Nike Dri-FIT Running Shirt" - $40 - sub-category: `running-shirt`
- **RUN-006:** "FlipBelt Running Belt" - $28 - sub-category: `running-belt`
- **RUN-007:** "Balega Running Socks" - $15 - sub-category: `running-socks`

### Beach/Water Sports
- **BCH-001:** "O'Neill Wetsuit Full 3mm" - $150 - sub-category: `wetsuit`
- **BCH-002:** "Speedo Swimsuit" - $45 - sub-category: `swimsuit`
- **BCH-003:** "Reef Flip Flops" - $30 - sub-category: `sandals`
- **BCH-004:** "Sun Bum Sunscreen SPF 50" - $18 - sub-category: `sunscreen`
- **BCH-005:** "Oakley Beach Volleyball" - $35 - sub-category: `beach-ball`

---

## Test Scenarios

### Scenario 1: Happy Path - Diversity Filtering (UF1)

**Query:** "I'm going skiing next week"

**Expected Behavior:**
- AI searches for products in skiing category
- AI infers sub-categories from product data:
  - SKI-001, SKI-002 → both `skis`
  - SKI-003 → `ski-boots`
  - SKI-004 → `ski-goggles`
  - SKI-005, SKI-006 → both `ski-jacket`
  - SKI-007 → `ski-pants`
  - SKI-008 → `ski-gloves`
  - SKI-009 → `ski-poles`
- Diversity filter selects max 1 per sub-category:
  - `skis`: SKI-001 (Alpine Pro) selected, SKI-002 filtered out
  - `ski-jacket`: SKI-005 (Burton) selected, SKI-006 filtered out
  - All other sub-categories have only 1 product, so included

**Expected Result:**
- 7 products shown (Essential: skis, boots, poles | Recommended: jacket, pants | Optional: goggles, gloves)
- No two products share the same sub-category
- SKI-002 and SKI-006 are silently excluded
- No UI indication of filtering

**Validation Points:**
- ✅ Max 1 product per sub-category across all tiers
- ✅ Higher-ranked product (by AI preference) selected when duplicates exist
- ✅ Diversity filtering is invisible to user
- ✅ Recommendation contains mix of Essential/Recommended/Optional tiers

---

### Scenario 2: Edge Case - All Products Same Sub-category (UF1)

**Query:** "I need running shoes"

**Expected Behavior:**
- AI searches for "running shoes"
- Finds RUN-001 and RUN-002, both inferred as `running-shoes` sub-category
- Diversity filter selects only 1 product

**Expected Result:**
- 1 product shown (e.g., RUN-001 Nike Pegasus)
- Tier: Essential
- RUN-002 filtered out due to duplicate sub-category

**Validation Points:**
- ✅ Shows fewer products when diversity constraint limits results
- ✅ No error message - just shows 1 product
- ✅ User can still refine to request "alternatives"

---

### Scenario 3: Happy Path - Multiple Sub-categories Available (UF1)

**Query:** "hiking trip essentials"

**Expected Behavior:**
- AI searches hiking category
- AI infers sub-categories:
  - HIK-001, HIK-002 → both `hiking-boots`
  - HIK-003 → `hiking-backpack`
  - HIK-004 → `trekking-poles`
  - HIK-005, HIK-006 → both `rain-jacket`
  - HIK-007 → `hydration-pack`
  - HIK-008 → `hiking-pants`
  - HIK-009 → `hiking-socks`
- Diversity filter selects max 1 per sub-category

**Expected Result:**
- 6 products shown across tiers
- Essential: hiking-boots (HIK-001), hiking-backpack (HIK-003), trekking-poles (HIK-004)
- Recommended: rain-jacket (HIK-005), hydration-pack (HIK-007)
- Optional: hiking-pants (HIK-008), hiking-socks (HIK-009)
- HIK-002 and HIK-006 filtered out

**Validation Points:**
- ✅ Diverse product mix across sub-categories
- ✅ Proper tier assignment
- ✅ Duplicate sub-categories filtered silently

---

### Scenario 4: Refinement Maintaining Diversity (UF2)

**Query (Initial):** "skiing gear"

**Initial Result:**
- 7 products (same as Scenario 1)

**Refinement:** "show options under $100"

**Expected Behavior:**
- AI re-searches with price constraint: price < 10000 cents
- Finds: SKI-004 (goggles $85), SKI-008 (gloves $45), SKI-009 (poles $95)
- All 3 have unique sub-categories: `ski-goggles`, `ski-gloves`, `ski-poles`
- Diversity filter: all 3 pass (no duplicates)

**Expected Result:**
- 3 products shown
- All priced under $100
- Each from different sub-category
- Tier re-assignment: goggles (Essential), poles (Recommended), gloves (Optional)

**Validation Points:**
- ✅ Refinement respects price constraint
- ✅ Diversity rule still enforced
- ✅ Fewer products shown due to tighter constraints
- ✅ No error message (showing fewer products is acceptable)

---

### Scenario 5: Refinement Excluding Sub-category (UF2)

**Query (Initial):** "skiing gear"

**Initial Result:**
- 7 products including SKI-005 (ski-jacket)

**Refinement:** "I already have a jacket"

**Expected Behavior:**
- AI interprets "jacket" as excluding `ski-jacket` sub-category
- Searches for skiing products, excludes `ski-jacket`
- Finds remaining products: skis, boots, goggles, pants, gloves, poles
- Applies diversity filter (may eliminate duplicate `skis` if multiple found)

**Expected Result:**
- 6 products shown (all except jacket)
- Essential: skis, boots, poles
- Recommended: pants
- Optional: goggles, gloves
- No jacket product visible

**Validation Points:**
- ✅ Specific sub-category excluded based on user feedback
- ✅ Remaining products still respect diversity
- ✅ List adjusts smoothly without error

---

### Scenario 6: Edge Case - Insufficient Products After Refinement (UF2)

**Query (Initial):** "beach vacation gear"

**Initial Result:**
- 5 products: BCH-001 (wetsuit), BCH-002 (swimsuit), BCH-003 (sandals), BCH-004 (sunscreen), BCH-005 (beach-ball)

**Refinement:** "exclude clothing, under $25"

**Expected Behavior:**
- AI excludes `wetsuit` and `swimsuit` sub-categories
- Filters by price < 2500 cents
- Finds: BCH-004 (sunscreen $18)
- BCH-003 (sandals $30) excluded by price
- BCH-005 (beach-ball $35) excluded by price

**Expected Result:**
- 1 product shown: sunscreen
- Tier: Essential
- No error message

**Validation Points:**
- ✅ Shows 1 product when constraints leave only 1
- ✅ No padding with duplicate sub-categories
- ✅ Graceful handling of restrictive refinements

---

### Scenario 7: Edge Case - Empty Query (UF1)

**Query:** *(empty or missing)*

**Expected Behavior:**
- Tool invoked without query parameter
- Widget opens with default state

**Expected Result:**
- Message displayed: "What activity or gear are you looking for? Use the refine field to describe your needs."
- RefineInput component visible and functional
- No products shown initially

**Validation Points:**
- ✅ Handles empty query gracefully
- ✅ Prompts user to provide input via RefineInput
- ✅ No error or crash

---

### Scenario 8: Edge Case - AI Inference Failure (UF1)

**Query:** "outdoor adventure"

**Expected Behavior:**
- AI searches broad "outdoor" categories
- AI inference fails to confidently assign sub-categories (returns generic "product" for all)
- Fallback: show recommendations without diversity filtering

**Expected Result:**
- 7-10 products shown across multiple categories (hiking, camping, etc.)
- Products may include duplicates from same actual sub-category
- No error shown to user

**Validation Points:**
- ✅ Fallback behavior activates when inference fails
- ✅ User still gets recommendations (better than nothing)
- ✅ System logs inference failure for monitoring

---

### Scenario 9: Mixed Activity Query (UF1)

**Query:** "running and swimming gear"

**Expected Behavior:**
- AI searches both running and beach/water categories
- AI infers sub-categories:
  - RUN-001, RUN-002 → `running-shoes`
  - RUN-003 → `gps-watch`
  - RUN-004 → `running-shorts`
  - BCH-001 → `wetsuit`
  - BCH-002 → `swimsuit`
  - BCH-003 → `sandals`
- Diversity filter: max 1 per sub-category

**Expected Result:**
- 6 products shown across running and swimming
- Essential: running-shoes (RUN-001), swimsuit (BCH-002)
- Recommended: wetsuit (BCH-001), gps-watch (RUN-003)
- Optional: running-shorts (RUN-004), sandals (BCH-003)
- RUN-002 filtered out (duplicate `running-shoes`)

**Validation Points:**
- ✅ Handles multi-category queries
- ✅ Diversity enforced across combined results
- ✅ Balanced representation from both activities

---

### Scenario 10: Refinement with Conflicting Constraints (UF2)

**Query (Initial):** "hiking essentials"

**Initial Result:**
- 6 products from hiking category

**Refinement:** "only essential gear, under $50"

**Expected Behavior:**
- AI filters to Essential tier only
- Applies price constraint: price < 5000 cents
- From hiking catalog, finds: HIK-009 (socks $22)
- HIK-001, HIK-003, HIK-004 exceed price limit
- Diversity filter: only 1 product passes both constraints

**Expected Result:**
- 1 product shown: hiking socks (HIK-009)
- Tier: Essential
- Message could optionally say: "Found 1 item matching your criteria"

**Validation Points:**
- ✅ Multiple constraint application (tier + price)
- ✅ Shows results even if minimal
- ✅ Maintains diversity (only 1 product, so no duplicates possible)

---

### Scenario 11: Personalization with Diversity (UF1)

**Query:** "running gear for a marathon"

**User Context:**
- Previously purchased: RUN-001 (Nike Pegasus running shoes)
- Budget preference: $200

**Expected Behavior:**
- AI searches running category
- Excludes or de-prioritizes RUN-001 (already owned)
- Considers budget: prioritizes items ≤ $200
- Finds: RUN-003 (GPS watch $250 - over budget), RUN-004 (shorts $35), RUN-005 (shirt $40), RUN-006 (belt $28), RUN-007 (socks $15)
- Infers sub-categories: `gps-watch`, `running-shorts`, `running-shirt`, `running-belt`, `running-socks`
- Diversity filter: all unique, all pass

**Expected Result:**
- 4-5 products shown (excludes GPS watch due to budget)
- Essential: running-shorts (RUN-004), running-shirt (RUN-005)
- Recommended: running-belt (RUN-006)
- Optional: running-socks (RUN-007)
- No running shoes shown (user already has them)

**Validation Points:**
- ✅ Personalization based on purchase history
- ✅ Budget filtering works alongside diversity
- ✅ All products have unique sub-categories

---

### Scenario 12: Sequential Refinements (UF2)

**Query (Initial):** "skiing gear"

**Initial Result:**
- 7 products

**Refinement 1:** "no jacket"

**Result after Refinement 1:**
- 6 products (jacket removed)

**Refinement 2:** "also exclude poles"

**Expected Behavior:**
- AI excludes both `ski-jacket` and `ski-poles` sub-categories
- Searches skiing products, excludes both
- Finds: skis, boots, goggles, pants, gloves
- Diversity filter: all unique sub-categories

**Expected Result:**
- 5 products shown
- Essential: skis, boots
- Recommended: pants
- Optional: goggles, gloves

**Validation Points:**
- ✅ Sequential refinements accumulate exclusions
- ✅ Each refinement maintains diversity
- ✅ List shrinks appropriately with each exclusion

---

## Test Execution Checklist

For each scenario above:
- [ ] Verify AI correctly infers sub-categories from product data
- [ ] Verify diversity filter applies max 1 per sub-category globally
- [ ] Verify filtered products are not visible to user (no UI indication)
- [ ] Verify tier assignments are sensible for the activity
- [ ] Verify refinements maintain diversity rules
- [ ] Verify empty results show appropriate messages
- [ ] Verify out-of-stock products (if any) show "Unavailable" status
- [ ] Verify logging captures sub-category inference and filtering actions
- [ ] Verify personalization (history, budget) works alongside diversity
- [ ] Verify fallback behavior when AI inference fails

---

## Test Data Setup

To run these scenarios, the test environment should:
1. Seed database with products from "Test Product Catalog" section above
2. Configure AI model to recognize activity types (skiing, hiking, running, beach)
3. Enable sub-category inference in recommendation agent
4. Enable diversity filtering in post-processing pipeline
5. Set up logging to capture inference and filtering actions
6. Create test user accounts with purchase history for personalization scenarios

**Note:** Sub-categories listed above are the *expected* AI inference results. The actual implementation will infer these dynamically from product titles and descriptions.
