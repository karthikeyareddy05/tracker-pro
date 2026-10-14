/** One-off: connect to MongoDB and create all collections' indexes. */
import { loadConfig } from "../config.js";
import { connectMongo, ensureIndexes, getCollections } from "../db.js";

const config = loadConfig();
const { client, db } = await connectMongo(config.mongodbUri, config.mongodbDbName);
await ensureIndexes(getCollections(db));
console.log(`Indexes ensured on database "${config.mongodbDbName}".`);
await client.close();
