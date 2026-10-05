/**
 * Provision a user account out-of-band (signup is disabled in production).
 *
 * Run inside the running node container so it inherits DB env vars:
 *   docker compose exec node npx tsx scripts/createUser.ts <username> <email> <password>
 *
 * Or locally with backend/.env populated:
 *   cd backend && npx tsx scripts/createUser.ts alice alice@example.org 'S3cret!pw'
 *
 * Mirrors the hashing/shape used by accounts.service.ts (argon2, UserDetails).
 */
import { MongoClient } from "mongodb";
import argon2 from "argon2";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  const [username, email, password] = process.argv.slice(2);

  if (!username || !email || !password) {
    console.error(
      "Usage: npx tsx scripts/createUser.ts <username> <email> <password>",
    );
    process.exit(1);
  }

  const connString = process.env.DB_CONN_STRING || "";
  const dbName = process.env.DB_NAME || "";
  const collectionName =
    process.env.USER_DETAILS_COLLECTION_NAME || "UserDetails";

  if (!connString || !dbName) {
    console.error("DB_CONN_STRING and DB_NAME must be set in the environment.");
    process.exit(1);
  }

  const client = new MongoClient(connString);
  try {
    await client.connect();
    const collection = client.db(dbName).collection(collectionName);

    // Match the unique-email constraint enforced by the app.
    await collection.createIndex({ email: 1 }, { unique: true });

    const existing = await collection.findOne({ email });
    if (existing) {
      console.error(`A user with email "${email}" already exists.`);
      process.exit(1);
    }

    const hashed = await argon2.hash(password);
    const result = await collection.insertOne({
      username,
      email,
      password: hashed,
      createdAt: new Date().toISOString(),
    });

    console.log(
      `Created user "${username}" <${email}> (id: ${result.insertedId.toString()})`,
    );
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("Failed to create user:", err.message ?? err);
  process.exit(1);
});
