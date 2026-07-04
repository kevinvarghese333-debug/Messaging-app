import http from "http";
import { createApp } from "./app";
import { initIo } from "./realtime/io";
import { startReminderScheduler } from "./services/reminderScheduler";

const port = Number(process.env.PORT ?? 3021);

const app = createApp();
const server = http.createServer(app);
initIo(server);
startReminderScheduler();

server.listen(port, () => {
  console.log(`API + realtime listening on http://localhost:${port}`);
});
