import type { Config } from '@react-router/dev/config';
import 'react-router';

declare module 'react-router' {
  interface Future {
    // unstable_middleware: true;
  }
}

export default {
  ssr: true,
  splitRouteModules: true,
  future: {},
} satisfies Config;
