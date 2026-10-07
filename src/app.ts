import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { z } from "zod";
import { issueToken, requireAuth, uid } from "./auth.js";
import type { Ctx } from "./context.js";
import { CATEGORIES } from "./db.js";
import { AppError } from "./errors.js";
import { deleteImages, mediaUrl, storeImage, type StoredImage } from "./media.js";
import {
  adminQueue,
  archiveProduct,
  brandDashboard,
  brandSummary,
  brandTags,
  createProduct,
  decideClaim,
  getBrandBySlug,
  listProducts,
  managedBrand,
  publicBrand,
  publicProduct,
  reviewTag,
  searchBrands,
  setBrandLogo,
  updateBrand,
  updateProduct,
  verifyBrand,
} from "./services/brands.js";
import {
  addComment,
  addTag,
  brandPosts,
  createPost,
  deleteComment,
  deletePost,
  deleteTag,
  explore,
  feed,
  listComments,
  postView,
  savedPosts,
  setLike,
  setSave,
  trackClick,
  updateCaption,
  userPosts,
} from "./services/posts.js";
import {
  authenticate,
  follow,
  getUser,
  getUserByUsername,
  me,
  profile,
  registerUser,
  searchUsers,
  setAvatar,
  unfollow,
  updateProfile,
} from "./services/users.js";
import { normalizeHttpUrl } from "./util.js";

// ---- Schemas ----------------------------------------------------------------

const httpUrl = z.string().max(2048).transform((v, c) => {
  const u = normalizeHttpUrl(v);
  if (!u) c.addIssue({ code: "custom", message: "Must be an http(s) link" });
  return u ?? "";
});
const category = z.enum(CATEGORIES);
const tagBody = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    label: z.string().trim().min(1).max(80),
    category,
    brandSlug: z.string().max(60).optional(),
    brandName: z.string().trim().min(1).max(60).optional(),
    productId: z.number().int().positive().optional(),
    url: httpUrl.optional(),
  })
  .refine((t) => t.brandSlug || t.brandName, { message: "Each tag needs brandSlug or brandName" });

const schemas = {
  register: z.object({
    username: z
      .string()
      .toLowerCase()
      .regex(/^[a-z0-9._]{3,30}$/, "3-30 characters: letters, numbers, '.' or '_'"),
    email: z.email().toLowerCase(),
    password: z.string().min(8).max(128),
    displayName: z.string().trim().min(1).max(60),
    accountType: z.enum(["PERSONAL", "BRAND"]).default("PERSONAL"),
    brand: z
      .object({ name: z.string().trim().min(1).max(60), website: httpUrl, message: z.string().max(500).optional() })
      .optional(),
  }),
  login: z.object({ login: z.string().toLowerCase(), password: z.string() }),
  profile: z.object({ displayName: z.string().trim().min(1).max(60).optional(), bio: z.string().max(300).optional() }),
  caption: z.string().max(2200).default(""),
  tags: z.array(tagBody.and(z.object({ image: z.number().int().min(0) }))).max(100).default([]),
  captionBody: z.object({ caption: z.string().max(2200) }),
  addTag: tagBody.and(z.object({ imageId: z.number().int().positive() })),
  comment: z.object({ body: z.string().trim().min(1).max(1000) }),
  page: z.object({
    limit: z.coerce.number().int().min(1).max(50).default(12),
    before: z.coerce.number().int().positive().optional(),
  }),
  explore: z.object({ category: category.optional(), q: z.string().trim().max(60).optional() }),
  brandUpdate: z.object({ website: httpUrl.optional(), description: z.string().max(500).optional() }),
  product: z.object({
    name: z.string().trim().min(1).max(120),
    url: httpUrl,
    price: z.coerce.number().min(0).max(1_000_000).optional(),
    currency: z.string().regex(/^[A-Z]{3}$/).optional(),
    category,
  }),
  review: z.object({ action: z.enum(["CONFIRM", "REJECT"]), productId: z.number().int().positive().nullable().optional() }),
  verify: z.object({ verified: z.boolean() }),
  decide: z.object({ approve: z.boolean() }),
};

function parse<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  const r = schema.safeParse(data ?? {});
  if (!r.success) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Invalid request",
      r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return r.data;
}

function intParam(req: Request, name = "id"): number {
  const n = Number(req.params[name]);
  if (!Number.isSafeInteger(n) || n <= 0) throw new AppError("VALIDATION_ERROR", `Invalid ${name}`);
  return n;
}

function jsonField(value: unknown, field: string): unknown {
  if (value === undefined || value === "") return undefined;
  try {
    return JSON.parse(String(value));
  } catch {
    throw new AppError("VALIDATION_ERROR", `${field} must be JSON`);
  }
}

const toCents = (price?: number) => (price === undefined ? undefined : Math.round(price * 100));

// ---- App --------------------------------------------------------------------

export function createApp(ctx: Ctx) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));
  app.use(express.static(fileURLToPath(new URL("../public", import.meta.url))));
  app.use(
    "/media",
    express.static(resolve(ctx.config.uploadDir), {
      immutable: true,
      maxAge: "365d",
      setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
    }),
  );

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: ctx.config.upload.maxFileBytes, files: ctx.config.upload.maxImagesPerPost, fields: 10 },
  });

  const auth = requireAuth(ctx);
  // Public pages (profiles, posts, brands) work signed out, but personalise when a token is sent.
  const optionalAuth = (req: Request, res: Response, next: NextFunction) =>
    req.headers.authorization ? auth(req, res, next) : next();

  const api = express.Router();

  api.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  api.get("/categories", (_req, res) => {
    res.json(CATEGORIES);
  });

  // ---- Auth & users ----
  api.post("/auth/register", (req, res) => {
    const body = parse(schemas.register, req.body);
    const { user, brand } = registerUser(ctx, body);
    res.status(201).json({ user: me(ctx, user), brand, token: issueToken(ctx, user.id) });
  });

  api.post("/auth/login", (req, res) => {
    const body = parse(schemas.login, req.body);
    const user = authenticate(ctx, body.login, body.password);
    res.json({ user: me(ctx, user), token: issueToken(ctx, user.id) });
  });

  api.get("/me", auth, (req, res) => {
    res.json(me(ctx, getUser(ctx, uid(req))));
  });

  api.patch("/me", auth, (req, res) => {
    updateProfile(ctx, uid(req), parse(schemas.profile, req.body));
    res.json(me(ctx, getUser(ctx, uid(req))));
  });

  api.put("/me/avatar", auth, upload.single("avatar"), async (req, res) => {
    if (!req.file) throw new AppError("VALIDATION_ERROR", "Attach an image as 'avatar'");
    const img = await storeImage(ctx.config, req.file.buffer, { square: 320 });
    const old = setAvatar(ctx, uid(req), img.path);
    await deleteImages(ctx.config, [img.thumbPath, ...(old ? [old] : [])]);
    res.json({ avatarUrl: mediaUrl(img.path) });
  });

  api.get("/me/saved", auth, (req, res) => {
    res.json(savedPosts(ctx, uid(req), parse(schemas.page, req.query)));
  });

  api.get("/users", (req, res) => {
    res.json(searchUsers(ctx, String(req.query.q ?? "")));
  });

  api.get("/users/:username", optionalAuth, (req, res) => {
    res.json(profile(ctx, getUserByUsername(ctx, String(req.params.username)), req.userId));
  });

  api.get("/users/:username/posts", (req, res) => {
    res.json(userPosts(ctx, String(req.params.username), parse(schemas.page, req.query)));
  });

  api.put("/users/:username/follow", auth, (req, res) => {
    follow(ctx, uid(req), String(req.params.username));
    res.status(204).end();
  });

  api.delete("/users/:username/follow", auth, (req, res) => {
    unfollow(ctx, uid(req), String(req.params.username));
    res.status(204).end();
  });

  // ---- Posts ----
  api.post("/posts", auth, upload.array("images"), async (req, res) => {
    const files = (req.files ?? []) as Express.Multer.File[];
    if (files.length === 0) throw new AppError("VALIDATION_ERROR", "Attach at least one photo as 'images'");
    const caption = parse(schemas.caption, req.body.caption ?? "");
    const tags = parse(schemas.tags, jsonField(req.body.tags, "tags") ?? []);
    const stored: StoredImage[] = [];
    try {
      for (const f of files) stored.push(await storeImage(ctx.config, f.buffer));
      const postId = createPost(ctx, uid(req), stored, caption, tags);
      res.status(201).json(postView(ctx, postId, uid(req)));
    } catch (err) {
      await deleteImages(ctx.config, stored.flatMap((s) => [s.path, s.thumbPath]));
      throw err;
    }
  });

  api.get("/feed", auth, (req, res) => {
    res.json(feed(ctx, uid(req), parse(schemas.page, req.query)));
  });

  api.get("/explore", (req, res) => {
    res.json(explore(ctx, { ...parse(schemas.page, req.query), ...parse(schemas.explore, req.query) }));
  });

  api.get("/posts/:id", optionalAuth, (req, res) => {
    res.json(postView(ctx, intParam(req), req.userId));
  });

  api.patch("/posts/:id", auth, (req, res) => {
    updateCaption(ctx, uid(req), intParam(req), parse(schemas.captionBody, req.body).caption);
    res.json(postView(ctx, intParam(req), uid(req)));
  });

  api.delete("/posts/:id", auth, async (req, res) => {
    const files = deletePost(ctx, uid(req), intParam(req));
    await deleteImages(ctx.config, files);
    res.status(204).end();
  });

  api.post("/posts/:id/tags", auth, (req, res) => {
    const { imageId, ...tag } = parse(schemas.addTag, req.body);
    addTag(ctx, uid(req), intParam(req), imageId, tag);
    res.status(201).json(postView(ctx, intParam(req), uid(req)));
  });

  api.delete("/tags/:id", auth, (req, res) => {
    deleteTag(ctx, uid(req), intParam(req));
    res.status(204).end();
  });

  for (const [path, fn] of [
    ["like", setLike],
    ["save", setSave],
  ] as const) {
    api.put(`/posts/:id/${path}`, auth, (req, res) => {
      fn(ctx, uid(req), intParam(req), true);
      res.status(204).end();
    });
    api.delete(`/posts/:id/${path}`, auth, (req, res) => {
      fn(ctx, uid(req), intParam(req), false);
      res.status(204).end();
    });
  }

  api.get("/posts/:id/comments", (req, res) => {
    res.json(listComments(ctx, intParam(req)));
  });

  api.post("/posts/:id/comments", auth, (req, res) => {
    res.status(201).json(addComment(ctx, uid(req), intParam(req), parse(schemas.comment, req.body).body));
  });

  api.delete("/comments/:id", auth, (req, res) => {
    deleteComment(ctx, uid(req), intParam(req));
    res.status(204).end();
  });

  // ---- Brands (public) ----
  api.get("/brands", (req, res) => {
    res.json(searchBrands(ctx, String(req.query.q ?? "")).map(brandSummary));
  });

  api.get("/brands/:slug", (req, res) => {
    res.json(publicBrand(ctx, getBrandBySlug(ctx, String(req.params.slug))));
  });

  api.get("/brands/:slug/products", (req, res) => {
    const b = getBrandBySlug(ctx, String(req.params.slug));
    res.json(listProducts(ctx, b.id, req.query.q ? String(req.query.q) : undefined).map(publicProduct));
  });

  api.get("/brands/:slug/posts", (req, res) => {
    const b = getBrandBySlug(ctx, String(req.params.slug));
    const productId = req.query.product ? Number(req.query.product) : undefined;
    res.json(brandPosts(ctx, b.id, { ...parse(schemas.page, req.query), productId }));
  });

  // ---- Brand management (verified brand accounts) ----
  api.get("/brand/dashboard", auth, (req, res) => {
    res.json(brandDashboard(ctx, uid(req)));
  });

  api.patch("/brand", auth, (req, res) => {
    res.json(publicBrand(ctx, updateBrand(ctx, uid(req), parse(schemas.brandUpdate, req.body))));
  });

  api.put("/brand/logo", auth, upload.single("logo"), async (req, res) => {
    managedBrand(ctx, uid(req)); // check before processing the upload
    if (!req.file) throw new AppError("VALIDATION_ERROR", "Attach an image as 'logo'");
    const img = await storeImage(ctx.config, req.file.buffer, { square: 320 });
    const old = setBrandLogo(ctx, uid(req), img.path);
    await deleteImages(ctx.config, [img.thumbPath, ...(old ? [old] : [])]);
    res.json({ logoUrl: mediaUrl(img.path) });
  });

  api.get("/brand/products", auth, (req, res) => {
    res.json(listProducts(ctx, managedBrand(ctx, uid(req)).id).map(publicProduct));
  });

  api.post("/brand/products", auth, (req, res) => {
    const b = parse(schemas.product, req.body);
    res.status(201).json(publicProduct(createProduct(ctx, uid(req), { ...b, priceCents: toCents(b.price) })));
  });

  api.patch("/brand/products/:id", auth, (req, res) => {
    const b = parse(schemas.product.partial(), req.body);
    res.json(publicProduct(updateProduct(ctx, uid(req), intParam(req), { ...b, priceCents: toCents(b.price) })));
  });

  api.delete("/brand/products/:id", auth, (req, res) => {
    archiveProduct(ctx, uid(req), intParam(req));
    res.status(204).end();
  });

  api.get("/brand/tags", auth, (req, res) => {
    const status = parse(z.enum(["PENDING", "CONFIRMED", "REJECTED"]).optional(), req.query.status);
    res.json(brandTags(ctx, uid(req), status));
  });

  api.post("/brand/tags/:id/review", auth, (req, res) => {
    reviewTag(ctx, uid(req), intParam(req), parse(schemas.review, req.body));
    res.status(204).end();
  });

  // ---- Admin ----
  api.get("/admin/queue", auth, (req, res) => {
    res.json(adminQueue(ctx, uid(req)));
  });

  api.post("/admin/brands/:slug/verify", auth, (req, res) => {
    verifyBrand(ctx, uid(req), String(req.params.slug), parse(schemas.verify, req.body).verified);
    res.status(204).end();
  });

  api.post("/admin/claims/:id", auth, (req, res) => {
    decideClaim(ctx, uid(req), intParam(req), parse(schemas.decide, req.body).approve);
    res.status(204).end();
  });

  app.use("/api", api);
  app.use("/api", (_req, _res, next) => next(new AppError("NOT_FOUND", "Route not found")));

  // Outbound "Shop" links: count the click, then redirect to the stored http(s) URL.
  app.get("/t/:id", (req, res) => {
    res.redirect(302, trackClick(ctx, intParam(req)));
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
      return;
    }
    if (err instanceof multer.MulterError) {
      const tooBig = err.code === "LIMIT_FILE_SIZE" || err.code === "LIMIT_FILE_COUNT";
      res.status(tooBig ? 413 : 400).json({
        error: {
          code: tooBig ? "PAYLOAD_TOO_LARGE" : "VALIDATION_ERROR",
          message:
            err.code === "LIMIT_FILE_SIZE"
              ? `Photos must be under ${ctx.config.upload.maxFileBytes / 1024 / 1024} MB`
              : err.code === "LIMIT_FILE_COUNT"
                ? `At most ${ctx.config.upload.maxImagesPerPost} photos per post`
                : err.message,
        },
      });
      return;
    }
    if (err instanceof SyntaxError && "body" in err) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Malformed JSON body" } });
      return;
    }
    console.error(err);
    res.status(500).json({ error: { code: "INTERNAL", message: "Internal server error" } });
  });

  return app;
}
