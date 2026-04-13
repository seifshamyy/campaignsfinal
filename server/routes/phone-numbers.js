import { Router } from "express";
import { prisma } from "../index.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

// GET /api/phone-numbers — active phone numbers for the account (regular user access)
router.get("/", async (req, res) => {
  const phones = await prisma.phoneNumber.findMany({
    where: { accountId: req.accountId, isActive: true },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      label: true,
      displayNumber: true,
      verifiedName: true,
      phoneNumberId: true,
      wabaId: true,
      isActive: true,
    },
  });
  res.json(phones);
});

export default router;
