import type { Config } from "@react-router/dev/config";
import "react-router";

declare module "react-router" {
  interface Future {
    // unstable_middleware: true;
  }
}

export default {
  ssr: true,
  future: {
    v8_middleware: true,
    // unstable_middleware: true,
    // unstable_optimizeDeps: false,
    // unstable_splitRouteModules: false,
    v8_viteEnvironmentApi: true, // for cloudflare worker
  },
} satisfies Config;
