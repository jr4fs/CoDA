import dotenv from "dotenv";
import path from "path";
import { app } from "./app";
import { connectToMongo } from "./services/database.service"
import { failOrphanedSampling } from "./services/tasks.service"
// Load the single repo-root .env for local dev (run from backend/, __dirname is
// backend/src). In Docker the file is absent and env comes from docker-compose,
// so this is a harmless no-op there.
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const PORT = process.env.PORT || 8080;

async function start() {
  await connectToMongo()
  // Reconcile tasks left mid-sampling by a previous process (crash/redeploy).
  await failOrphanedSampling()
}

const server = app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}/api`);
  });

start();
