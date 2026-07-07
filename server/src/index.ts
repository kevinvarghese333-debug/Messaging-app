import http from "http";
import { createApp } from "./app";
import { initIo } from "./realtime/io";
import { startReminderScheduler } from "./services/reminderScheduler";

const port = Number(process.env.PORT ?? 3021);

if (
  process.env.NODE_ENV === "production" &&
  (process.env.JWT_SECRET ?? "dev-secret-change-me") === "dev-secret-change-me"
) {
  console.warn(
    "[security] JWT_SECRET is still the dev default. Set a strong JWT_SECRET " +
      "environment variable before letting your team use this deployment."
  );
}

const app = createApp();
const server = http.createServer(app);
initIo(server);
startReminderScheduler();

server.listen(port, () => {
  console.log(`API + realtime listening on http://localhost:${port}`);
});
