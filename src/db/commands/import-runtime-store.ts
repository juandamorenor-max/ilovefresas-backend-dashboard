import { loadRuntimeStore } from "../../data/runtime-store.js";
import { getPostgresRuntimeStore } from "../../data/postgres-runtime-store.js";

const store = getPostgresRuntimeStore();
if (!store.isEnabled()) {
  throw new Error(
    "Set DATABASE_URL and OPERATIONAL_STORE_MODE=postgres before importing the runtime store"
  );
}

const loaded = loadRuntimeStore();
if (!loaded) {
  throw new Error("RUNTIME_STORE_PATH does not contain a readable snapshot");
}

await store.persist();
console.log("Runtime snapshot imported into Postgres");

