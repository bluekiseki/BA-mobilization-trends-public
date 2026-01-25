import { redirect, type LoaderFunctionArgs } from 'react-router';

export async function loader({ params }: LoaderFunctionArgs) {
  return redirect(`/dashboard/${params.server}/${params.id}/`, 301);
}

export default function LegacyRaidTypeRedirect() {
  return null;
}
