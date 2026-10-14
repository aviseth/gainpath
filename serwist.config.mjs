// Serwist "configurator mode": works with Turbopack because it runs after
// `next build` instead of hooking into webpack. See package.json "build".
// Prerendered routes (every page here, including /~offline) are precached
// automatically.
import { serwist } from "@serwist/next/config";

export default serwist({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
});
