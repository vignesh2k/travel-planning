export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 gap-6">
      <h1 className="font-display text-4xl font-semibold tracking-tight text-ink-900">
        Where to next?
      </h1>
      <p className="text-ink-500 max-w-md text-center">
        Tell me about your trip in plain English — destination, days, what you love.
      </p>
      <div className="frosted-strong w-full max-w-xl rounded-[18px] p-4">
        <input
          className="w-full bg-transparent outline-none text-sm text-ink-900 placeholder:text-ink-500"
          placeholder="7 days in Kyoto, vegetarian, photography focus, mid-October…"
        />
      </div>
    </main>
  );
}
