import { gymManifestSchema, type GymManifest } from "./manifest";

/**
 * Committed gym manifests. Add a JSON file per gym (see README.md in this
 * folder) and list it here.
 */
const manifests: unknown[] = [];

export const GYM_MANIFESTS: readonly GymManifest[] = manifests.map((m) =>
  gymManifestSchema.parse(m),
);
