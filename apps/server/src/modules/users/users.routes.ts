import bcrypt from "bcryptjs";
import { Router } from "express";
import { prisma } from "../../config/db";
import { HttpError } from "../../utils/httpError";
import { userCreateSchema } from "./users.schemas";

export const usersRouter = Router();

const userSelect = { id: true, email: true, name: true, role: true, createdAt: true };

usersRouter.get("/", async (_req, res) => {
  const items = await prisma.user.findMany({ select: userSelect, orderBy: { createdAt: "asc" } });
  res.json({ items });
});

usersRouter.post("/", async (req, res) => {
  const data = userCreateSchema.parse(req.body);
  const passwordHash = await bcrypt.hash(data.password, 10);
  const user = await prisma.user.create({
    data: { email: data.email, passwordHash, name: data.name, role: data.role },
    select: userSelect,
  });
  res.status(201).json(user);
});

usersRouter.delete("/:id", async (req, res) => {
  if (req.user?.id === req.params.id) {
    throw new HttpError(400, "Không thể tự xoá tài khoản của chính mình");
  }
  await prisma.user.delete({ where: { id: req.params.id } });
  res.status(204).send();
});
