import { SignInButton } from "@/components/SignInButton";

const ERR_MESSAGES: Record<string, string> = {
  not_allowed: "This email isn't on the allowlist. Ask the admin to add you.",
  exchange: "Sign-in failed. Try again.",
  no_email: "We couldn't read your email from Google. Try again.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 px-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-ink-900">
        Welcome to Atlas
      </h1>
      <p className="text-ink-500 max-w-md text-center text-sm">
        Sign in with the Google account on the allowlist to start planning.
      </p>
      <SignInButton />
      {error && ERR_MESSAGES[error] && (
        <p className="text-rose-500 text-sm">{ERR_MESSAGES[error]}</p>
      )}
    </main>
  );
}
