import type { LoaderFunctionArgs } from 'react-router';
import { email as emailAddress } from '~/data/livedataServer.json';

// It acts like an API by exporting only the loader without a component (default export).
export async function loader({ request }: LoaderFunctionArgs) {
  const encodedEmail = Buffer.from(emailAddress).toString('base64');

  return Response.json({ data: encodedEmail });
}
