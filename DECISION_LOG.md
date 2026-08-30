# Decision Log: Skylark Drones BI Agent

## Key Assumptions Made
1. **Data Freshness over Caching:** Given the low request volume of a founder dashboard and the serverless nature of Vercel deployments (where in-memory cache resets on cold start), I chose to fetch data directly from Monday.com per-request. This ensures reports are always 100% accurate without caching bugs.
2. **"Tanjiro" vs "Tanjiro Kamado":** I noticed variations in character names across deals. I assumed it is safer to NOT automatically merge these records without domain knowledge, as false positives in financial joins are worse than false negatives.
3. **Clarifying Questions:** I assumed the prompt's instruction to "ask clarifying questions" meant these should feel like natural conversational flow, rather than requiring special UI popups. They render as standard assistant messages.

## Trade-offs Chosen
1. **Deal-Based vs Client-Based Join:** Client codes do not match between Deals (`COMPANYxxx`) and Work Orders (`WOCOMPANY_xxx`). There is zero overlap. I traded off the ability to analyze by client for the ability to analyze by deal name, which has an 89.7% match rate.
2. **Content-Based vs Index-Based Header Stripping:** I chose to dynamically strip header rows by looking for `Deal Stage == "Deal Stage"` rather than hardcoding rows 50 and 179. This adds a tiny bit of processing time but avoids the massive landmine of Monday.com API pagination reordering items.
3. **No Automatic Unit Conversion:** The quantity column contains mixed units (Hectares, Acres, RKM, MW, towers, etc.). I wrote a parser to separate the number from the unit, but explicitly traded away automatic conversion (e.g., Acres to Hectares) because the rules are too domain-specific and error-prone for a 6-hour build.
4. **LLM over SQL with Pre-Computed Rollups**: Instead of a brittle Text-to-SQL layer, the agent uses a tool that feeds the processed JSON data directly to Gemini 2.0 Flash. However, since LLMs are prone to silent arithmetic errors over hundreds of numbers, the ETL pipeline *pre-computes standard rollups* (sums, counts, group-bys) and provides them alongside the raw data. This ensures exact math while retaining LLM reasoning flexibility.
5. **No Streaming API**: I explicitly chose NOT to stream the LLM response to the client. While streaming feels nicer in a chat UI, a single fetch is far more reliable on Vercel's serverless infrastructure and reduces the complexity of handling mid-stream tool-calling errors.
6. **Mock Data Fallback**: To ensure the prototype is immediately testable without requiring you to configure Monday.com API keys first, I built a mock mode that loads the provided `.xlsx` data directly if the API key is missing.

## Interpretation of "Leadership Updates"
I interpreted this as a **high-level, cross-functional summary query** rather than a standalone dashboard page. When a founder asks for a "leadership update", the agent synthesizes data across both boards into a structured markdown report containing:
- Pipeline Summary (Deals health)
- Revenue / Billing Status (Work Orders financials)
- Sector Performance
- Operational Highlights (Execution status)
- Action Items & Risks (Identifying stuck deals or unbilled work)

## What I'd Do Differently With More Time
1. **Webhooks for Data Sync:** Instead of querying Monday.com on every chat request, I would set up Monday.com webhooks to push changes to a proper database (like Postgres/Supabase), enabling complex SQL analytical queries.
2. **Fuzzy Matching for Joins:** I would implement a fuzzy string matcher (like Levenshtein distance) to join orphaned work orders to deals (e.g., merging "Tanjiro" with "Tanjiro Kamado").
3. **Client Code Mapping:** I would build a mapping table to translate `WOCOMPANY_xxx` to `COMPANYxxx` so that client-level lifetime value (LTV) could be calculated.
4. **Advanced Visualizations:** I would integrate a charting library (like Recharts) and teach the agent to output chart configuration JSON alongside text, so the frontend could render actual graphs.
