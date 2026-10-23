# Search matching

Search preserves the existing city (4x4), neighbourhood (3x3), and specific-area (2x2) grids, geocoder bounds, address checks, and keyword/location combinations.

Product and business-role evidence are evaluated separately. Strong matches appear before possible sellers; within each group, supported roles precede unverified roles. Listing evidence does not verify current stock. Explicitly different roles are excluded from role-specific searches. Retailer, manufacturer, wholesaler, and distributor are separate choices.

Product profiles combine keyword synonyms, seller categories, and secondary seller categories from Gemini. Bat/cricket and kurti/kurta have offline category mappings. Without Gemini, other products use keyword/role queries and preserve generic candidate sellers with uncertainty badges. Any type rotates across all four roles; retail searches include related store categories. Unrelated specific stores and non-selling services are excluded when evidence supports exclusion.

The shared SEARCH_PLAN allows up to four queries and two pages per cell: maximum 128/72/32 Places calls for city/neighbourhood/specific per keyword-location pair. Actual calls can be fewer when no next page exists. UI credit estimates use the same limits; actual usage is charged after search. nextPageToken is requested explicitly and short/duplicate pages do not suppress an available second page.

Search cache v15 uses a SHA-256 digest of the complete parameters, avoiding truncated keys that can lose the type/scope/version suffix. Intent schema v7 refreshes older product mappings. Saved leads and Excel exports preserve uncertainty metadata. Stage counts are returned in diagnostics for fresh searches.

Run regression checks: `node --test tests/searchMatching.test.js tests/searchPipeline.test.js`.
Pipeline tests mock Google and Firestore; they do not measure live Google coverage or consume credits.
