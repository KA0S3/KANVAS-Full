import { startAdminServer } from "./server.mjs";

const instance = await startAdminServer();
console.log(`KANVAS admin server listening at ${instance.url}`);
