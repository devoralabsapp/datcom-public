import type { Metadata } from "next";
import "./rice.css";
import "./interface.css";
import "./statistics.css";
import "./pickup.css";
import "./users.css";
import "./payment.css";

export const metadata: Metadata = {
  title: "Cơm Nhà · Đặt cơm văn phòng",
  description: "Chọn món ngon, đặt cơm cùng đồng nghiệp và theo dõi thanh toán mỗi ngày.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="antialiased">{children}</body>
    </html>
  );
}
