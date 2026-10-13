import { Router } from "express";
import { z } from "zod";
import { all, get, newId, run } from "../db.js";
import { currentUser, rateLimit, requireAuth } from "../lib/auth.js";
import { HttpError, notFound } from "../lib/http.js";
import { readUpload, saveImage, sniffMime } from "../lib/images.js";
import { ownedProject, projectContext, serializeProject, touch } from "../lib/projects.js";
import { PLANS, PRODUCTS, ROOM_TYPES } from "../data/catalog.js";
import { activeImageProvider } from "../services/imageGen.js";
import { organiseRoom, renderTidy, type TidyReport } from "../services/organise.js";
import { upload } from "./projects.js";

export const organiseRouter = Router();
organiseRouter.use(requireAuth);

interface TidyRow {
  id: string;
  project_id: string;
  room_name: string;
  room_type: string;
  photo: string | null;
  report: string;
  provider: string;
  score: number | null;
  done: string;
  render: string | null;
  render_provider: string | null;
  created_at: string;
}

function serializeCheck(r: TidyRow) {
  const report = JSON.parse(r.report) as TidyReport;
  return {
    id: r.id,
    roomName: r.room_name,
    roomType: r.room_type,
    photo: r.photo,
    provider: r.provider,
    score: r.score,
    done: JSON.parse(r.done) as number[],
    render: r.render,
    renderProvider: r.render_provider,
    createdAt: r.created_at,
    report: {
      ...report,
      storage: report.storage.map((s) => ({ ...s, product: PRODUCTS.find((p) => p.id === s.productId) ?? null })),
    },
  };
}

function ownedCheck(req: Parameters<typeof currentUser>[0], id: string) {
  const row = get<TidyRow>(
    "SELECT t.* FROM tidy_checks t JOIN projects p ON p.id = t.project_id WHERE t.id = ? AND p.user_id = ?", id, currentUser(req).id,
  );
  if (!row) throw notFound("Tidy check");
  return row;
}

organiseRouter.get("/projects/:id/tidy", (req, res) => {
  const p = ownedProject(req, String(req.params.id));
  const rows = all<TidyRow>("SELECT * FROM tidy_checks WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 30", p.id);
  res.json({ checks: rows.map(serializeCheck), photoReal: activeImageProvider() !== "studio-preview" });
});

/** Analyse a room photo (uploaded now, or the project's photo) and create a tidy plan. */
organiseRouter.post("/projects/:id/tidy", rateLimit(10, 60_000), upload.single("photo"), async (req, res) => {
  const p = ownedProject(req, String(req.params.id));
  const user = currentUser(req);
  const body = z.object({
    roomName: z.string().trim().max(60).optional(),
    roomType: z.enum(ROOM_TYPES).optional(),
    useProjectPhoto: z.enum(["true", "false"]).optional(),
  }).parse(req.body ?? {});

  let photoUrl: string | null = null;
  if (req.file) {
    const mime = sniffMime(req.file.buffer);
    if (!mime) throw new HttpError(415, "Only JPG, PNG or WebP photos are supported");
    photoUrl = saveImage(req.file.buffer, mime);
  } else if (body.useProjectPhoto === "true") {
    photoUrl = p.source_image;
  }
  if (!photoUrl) throw new HttpError(400, "Take or upload a photo of the room first");

  const sp = serializeProject(p);
  const roomType = body.roomType && body.roomType !== "Whole home" ? body.roomType : sp.roomType === "Whole home" ? "Living room" : sp.roomType;
  const roomName = body.roomName || roomType;
  const { report, provider } = await organiseRoom(projectContext(p, user.province), roomType, roomName, readUpload(photoUrl));

  const id = newId();
  run(
    "INSERT INTO tidy_checks (id, project_id, room_name, room_type, photo, report, provider, score) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    id, p.id, roomName, roomType, photoUrl, JSON.stringify(report), provider, report.score,
  );
  touch(p.id);
  res.status(201).json({ check: serializeCheck(get<TidyRow>("SELECT * FROM tidy_checks WHERE id = ?", id)!) });
});

/** Tick off plan steps, or set a self-rated score when no photo AI is available. */
organiseRouter.patch("/tidy/:id", (req, res) => {
  const row = ownedCheck(req, String(req.params.id));
  const body = z.object({
    done: z.array(z.number().int().min(0).max(50)).max(50).optional(),
    score: z.number().int().min(0).max(100).optional(),
  }).parse(req.body);
  if (body.done) run("UPDATE tidy_checks SET done = ? WHERE id = ?", JSON.stringify([...new Set(body.done)].sort((a, b) => a - b)), row.id);
  if (body.score !== undefined) run("UPDATE tidy_checks SET score = ? WHERE id = ?", body.score, row.id);
  res.json({ check: serializeCheck(get<TidyRow>("SELECT * FROM tidy_checks WHERE id = ?", row.id)!) });
});

organiseRouter.delete("/tidy/:id", (req, res) => {
  const row = ownedCheck(req, String(req.params.id));
  run("DELETE FROM tidy_checks WHERE id = ?", row.id);
  res.status(204).end();
});

/** "After tidying" image: photo-real when an image AI is configured, otherwise an annotated tidy plan. */
organiseRouter.post("/tidy/:id/render", rateLimit(6, 60_000), async (req, res) => {
  const row = ownedCheck(req, String(req.params.id));
  const user = currentUser(req);
  const source = readUpload(row.photo);
  if (!source || source.mime === "image/svg+xml") throw new HttpError(400, "This check has no room photo to render from");

  const photoReal = activeImageProvider() !== "studio-preview";
  const month = new Date().toISOString().slice(0, 7);
  const used = get<{ generations: number }>("SELECT generations FROM usage WHERE user_id = ? AND month = ?", user.id, month)?.generations ?? 0;
  const allowance = PLANS[user.plan].monthlyGenerations;
  if (photoReal && used >= allowance) {
    throw new HttpError(402, `You've used ${used} of ${allowance} AI renders this month on the ${PLANS[user.plan].name} plan.`, "upgrade_required");
  }

  const p = get<{ finishes: string }>("SELECT finishes FROM projects WHERE id = ?", row.project_id)!;
  const style = (JSON.parse(p.finishes || "{}") as { style?: string }).style;
  const out = await renderTidy(source, row.room_type, { ...(JSON.parse(row.report) as TidyReport), score: row.score }, style);
  const url = saveImage(out.image.data, out.image.mime);
  run("UPDATE tidy_checks SET render = ?, render_provider = ? WHERE id = ?", url, out.provider, row.id);
  if (out.kind === "photo") {
    run(
      `INSERT INTO usage (user_id, month, generations) VALUES (?, ?, 1) ON CONFLICT(user_id, month) DO UPDATE SET generations = generations + 1`,
      user.id, month,
    );
  }
  res.json({ check: serializeCheck(get<TidyRow>("SELECT * FROM tidy_checks WHERE id = ?", row.id)!) });
});
