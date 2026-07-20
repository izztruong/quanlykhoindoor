import { Router } from "express";
import { prisma } from "../../config/db";
import { HttpError } from "../../utils/httpError";
import { recipeUpdateSchema } from "./finishedGoodRecipes.schemas";

export const finishedGoodRecipesRouter = Router();

finishedGoodRecipesRouter.get("/:finishedGoodItemId", async (req, res) => {
  const items = await prisma.finishedGoodRecipeItem.findMany({
    where: { finishedGoodItemId: req.params.finishedGoodItemId },
    include: { product: { include: { unit: true, recipeUnit: true } } },
    orderBy: { product: { name: "asc" } },
  });
  res.json({ items });
});

finishedGoodRecipesRouter.put("/:finishedGoodItemId", async (req, res) => {
  const { finishedGoodItemId } = req.params;
  const data = recipeUpdateSchema.parse(req.body);

  const finishedGoodItem = await prisma.finishedGoodItem.findUnique({ where: { id: finishedGoodItemId } });
  if (!finishedGoodItem) throw new HttpError(404, "Không tìm thấy đồ thành phẩm");

  const items = await prisma.$transaction(async (tx) => {
    await tx.finishedGoodRecipeItem.deleteMany({ where: { finishedGoodItemId } });
    if (data.items.length > 0) {
      await tx.finishedGoodRecipeItem.createMany({
        data: data.items.map((it) => ({
          finishedGoodItemId,
          productId: it.productId,
          quantityPerUnit: it.quantityPerUnit,
        })),
      });
    }
    return tx.finishedGoodRecipeItem.findMany({
      where: { finishedGoodItemId },
      include: { product: { include: { unit: true, recipeUnit: true } } },
      orderBy: { product: { name: "asc" } },
    });
  });

  res.json({ items });
});
