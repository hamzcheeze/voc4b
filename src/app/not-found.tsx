import Link from "next/link";
export default function NotFound() {
  return (
    <section>
      <h1>Page not found.</h1>
      <Link href="/">Back to today’s words</Link>
    </section>
  );
}
