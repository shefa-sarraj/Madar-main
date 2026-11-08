// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv, type ConfigEnv } from "vite";

const config = defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});

export default (env: ConfigEnv) => {
  // Private variables populate the local server process, never the client define map.
  const privateEnv = loadEnv(env.mode, process.cwd(), "SUPABASE_");
  for (const name of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const) {
    if (!process.env[name] && privateEnv[name]) process.env[name] = privateEnv[name];
  }
  return config(env);
};
