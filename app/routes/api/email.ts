import type { LoaderFunctionArgs } from 'react-router';
import { email as emailAddress } from '~/data/livedataServer.json';
import { vaildClient } from '~/utils/vaildClient';

// It acts like an API by exporting only the loader without a component (default export).
export async function loader({ request }: LoaderFunctionArgs) {
  if (!vaildClient(request)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  const encodedEmail = Buffer.from(emailAddress).toString('base64');

  return Response.json({ data: encodedEmail });
}
