import { Redirect } from 'expo-router';

/** The marketing site links to app.getcym.app/login; the screen lives at /auth. */
export default function LoginRedirect() {
  return <Redirect href="/auth" />;
}
