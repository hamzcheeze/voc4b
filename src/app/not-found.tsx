import Link from "next/link";
export default function NotFound() {
  return (
    <section>
      <h1>ไม่พบหน้านี้</h1>
      <Link href="/">กลับไปสองคำของวันนี้</Link>
    </section>
  );
}
