"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section role="alert">
      <h1>This page couldn’t load.</h1>
      <p>Try reloading the page.</p>
      <button className="primary" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
