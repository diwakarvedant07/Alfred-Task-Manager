-- Backfill: pre-existing User rows still hold the now-dead Gemini model
-- IDs (gemini-2.5-pro / gemini-2.5-flash / gemini-2.5-flash-lite all 404
-- against the live API). The prior migration only changed the column's
-- default for new inserts; move existing rows to the confirmed-live model.
UPDATE "User" SET "preferredAiModel" = 'gemini-3.8-flash'
WHERE "preferredAiModel" IN ('gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite');
