import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";

export function requireAuth(req, res, next) {
  const token =
    req.cookies?.token || req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireAdmin(req, res, next) {
  const token =
    req.cookies?.adminToken ||
    req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ error: "Admin authentication required" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload.isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired admin token" });
  }
}

export function signToken(payload, expiresIn = "24h") {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}
