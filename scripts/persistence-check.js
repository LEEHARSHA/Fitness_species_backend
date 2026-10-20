import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import mongo from '../src/config/mongodb.js';

const checkId = `persistence-check-${randomUUID()}`;
let inserted = false;

async function verifyPersistence() {
  if (process.env.MONGODB_DB_NAME !== 'fitness_species') {
    throw new Error('MONGODB_DB_NAME must be set to fitness_species.');
  }

  await mongo.connectDB();
  const checks = mongo.getDb().collection('backend_persistence_checks');
  const document = {
    _id: checkId,
    purpose: 'temporary MongoDB write/read verification',
    createdAt: new Date(),
  };
  const result = await checks.insertOne(document);
  inserted = result.acknowledged === true;
  if (!inserted) throw new Error('MongoDB did not acknowledge the persistence check write.');

  const saved = await checks.findOne({ _id: checkId });
  if (
    !saved
    || saved.purpose !== document.purpose
    || saved.createdAt?.getTime() !== document.createdAt.getTime()
  ) {
    throw new Error('MongoDB persistence check read-back did not match the inserted document.');
  }
}

try {
  await verifyPersistence();
  console.info('MongoDB persistence smoke test passed: temporary test document was written and read back.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  try {
    if (inserted) {
      const result = await mongo.getDb().collection('backend_persistence_checks')
        .deleteOne({ _id: checkId });
      if (result.deletedCount !== 1) {
        console.error('MongoDB persistence check cleanup did not delete its temporary document.');
        process.exitCode = 1;
      } else {
        console.info('Temporary persistence check document cleaned up.');
      }
    }
  } catch {
    console.error('MongoDB persistence check cleanup failed.');
    process.exitCode = 1;
  }
  try {
    await mongo.closeDB();
  } catch {
    console.error('MongoDB shutdown failed.');
    process.exitCode = 1;
  }
}
