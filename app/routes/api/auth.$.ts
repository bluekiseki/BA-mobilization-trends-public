// handled by workers/auth/index.ts via service binding in workers/app.ts
export function loader() {
  return new Response(null, { status: 404 });
}
export function action() {
  return new Response(null, { status: 404 });
}
