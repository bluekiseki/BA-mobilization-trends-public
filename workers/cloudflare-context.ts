import { createContext } from 'react-router';

export const CloudflareContext = createContext<{
  cloudflare: {
    env: Env;
    ctx: ExecutionContext;
  };
}>();
