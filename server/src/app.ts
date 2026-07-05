import express from "express";
import cors from "cors";
import path from "path";
import { authRouter } from "./routes/auth";
import { usersRouter } from "./routes/users";
import { departmentsRouter } from "./routes/departments";
import { channelsRouter } from "./routes/channels";
import { messagesRouter } from "./routes/messages";
import { tasksRouter } from "./routes/tasks";
import { meetingsRouter } from "./routes/meetings";
import { notificationsRouter } from "./routes/notifications";
import { searchRouter } from "./routes/search";
import { productivityRouter } from "./routes/productivity";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/departments", departmentsRouter);
  app.use("/api/channels", channelsRouter);
  app.use("/api", messagesRouter); // /api/channels/:id/messages, /api/messages/:id/thread, /api/mention-targets
  app.use("/api/tasks", tasksRouter);
  app.use("/api/meetings", meetingsRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/search", searchRouter);
  app.use("/api/productivity", productivityRouter);

  app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
