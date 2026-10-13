import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { Firm, User } from "./models.js";
import { AppError, parse } from "./errors.js";

export function authMiddleware(config) {
  return async (req, _res, next) => {
    let claims;
    try {
      claims = jwt.verify(req.cookies.session || "", config.JWT_SECRET, {
        algorithms: ["HS256"],
        issuer: "docchase",
        audience: "docchase-firm",
      });
    } catch {
      return next(
        new AppError(401, "UNAUTHENTICATED", "Please sign in to continue."),
      );
    }
    const user = await User.findById(claims.sub);
    if (!user || user.status !== "active" || user.tokenVersion !== claims.tv)
      return next(
        new AppError(401, "UNAUTHENTICATED", "Please sign in to continue."),
      );
    req.user = user;
    next();
  };
}
export function ownerOnly(req, _res, next) {
  if (req.user.role !== "owner")
    return next(
      new AppError(403, "FORBIDDEN", "Only the firm owner can do this."),
    );
  next();
}
export function csrfGuard(config) {
  return (req, _res, next) => {
    if (
      ["GET", "HEAD", "OPTIONS"].includes(req.method) ||
      req.path === "/internal/tick"
    )
      return next();
    const origin = req.get("origin");
    if (
      req.get("X-DocChase") !== "1" ||
      (origin && origin !== new URL(config.APP_URL).origin)
    )
      return next(
        new AppError(
          403,
          "ORIGIN_REJECTED",
          "Please send this request from DocChase.",
        ),
      );
    next();
  };
}
const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  firmId: user.firmId,
});
export function authRoutes(config) {
  const router = Router();
  const guard = authMiddleware(config);
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  function session(res, user) {
    const token = jwt.sign({ tv: user.tokenVersion }, config.JWT_SECRET, {
      subject: String(user._id),
      issuer: "docchase",
      audience: "docchase-firm",
      expiresIn: "12h",
    });
    res.cookie("session", token, {
      httpOnly: true,
      secure: config.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 12 * 60 * 60 * 1000,
      path: "/",
    });
  }
  router.post("/register", limiter, async (req, res) => {
    const data = parse(
      z.object({
        firmName: z.string().trim().min(2).max(100),
        name: z.string().trim().min(2).max(80),
        email: z.email().transform((v) => v.toLowerCase()),
        password: z.string().min(10).max(72),
      }),
      req.body,
    );
    if (await User.exists({ email: data.email }))
      throw new AppError(
        409,
        "ACCOUNT_EXISTS",
        "An account with this email already exists.",
      );
    const firm = await Firm.create({ name: data.firmName });
    try {
      const user = await User.create({
        firmId: firm._id,
        name: data.name,
        email: data.email,
        passwordHash: await bcrypt.hash(data.password, 12),
        role: "owner",
      });
      session(res, user);
      res.status(201).json({ user: publicUser(user), firm });
    } catch (error) {
      await Firm.deleteOne({ _id: firm._id });
      throw error;
    }
  });
  router.post("/login", limiter, async (req, res) => {
    const data = parse(
      z.object({
        email: z.email().transform((v) => v.toLowerCase()),
        password: z.string().max(72),
      }),
      req.body,
    );
    const user = await User.findOne({ email: data.email }).select(
      "+passwordHash",
    );
    const valid = await bcrypt.compare(
      data.password,
      user?.passwordHash ||
        "$2b$12$9LtKzvLtJqa43rs2TyY6..kCG1YclC4QSy6L1PkJclNMDDDxU2z5e",
    );
    if (!user || !valid || user.status !== "active")
      throw new AppError(
        401,
        "LOGIN_FAILED",
        "The email or password is incorrect.",
      );
    session(res, user);
    res.json({
      user: publicUser(user),
      firm: await Firm.findById(user.firmId),
    });
  });
  router.get("/me", guard, async (req, res) =>
    res.json({
      user: publicUser(req.user),
      firm: await Firm.findById(req.user.firmId),
    }),
  );
  router.post("/logout", guard, async (req, res) => {
    await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
    res.clearCookie("session", { path: "/" });
    res.json({ ok: true });
  });
  return router;
}
