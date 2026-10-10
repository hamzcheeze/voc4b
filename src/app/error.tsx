"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section role="alert">
      <h1>เปิดหน้านี้ไม่สำเร็จ</h1>
      <p>ลองโหลดหน้าใหม่อีกครั้ง</p>
      <button className="primary" onClick={reset}>
        ลองใหม่
      </button>
    </section>
  );
}
