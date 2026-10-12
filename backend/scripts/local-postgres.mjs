// Optional development helper. Database binaries/data stay outside the repository.
import EmbeddedPostgres from 'embedded-postgres';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const directory = process.env.LOCAL_PG_DIR || path.join(os.tmpdir(), 'pcdav-postgres');
await mkdir(directory, { recursive: true });
const pg = new EmbeddedPostgres({ databaseDir: directory, user: 'pcdav', password: 'pcdav_local', port: 5433, persistent: true });
await pg.initialise();
await pg.start();
try { await pg.createDatabase('pcdav'); } catch (error) { if (!String(error).includes('already exists')) throw error; }
console.log('Local PostgreSQL on localhost:5433. Keep this terminal open. Data:', directory);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await pg.stop(); process.exit(0); });
setInterval(() => {}, 60000);
