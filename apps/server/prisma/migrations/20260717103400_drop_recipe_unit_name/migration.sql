-- recipeUnitName's values have already been migrated to recipeUnitId (see app-level
-- data migration run before this) — safe to drop the now-redundant free-text column.
ALTER TABLE "Product" DROP COLUMN "recipeUnitName";
