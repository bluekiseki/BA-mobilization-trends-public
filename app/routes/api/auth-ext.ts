// handled by workers/auth/index.ts via service binding in workers/app.ts
export function action() {
  return new Response(null, { status: 404 });
}
