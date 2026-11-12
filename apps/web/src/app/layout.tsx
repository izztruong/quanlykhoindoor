import type { Metadata } from "next";
import { Be_Vietnam_Pro, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ToastContainer } from "@/components/ui/Toast";
import { QueryProvider } from "@/lib/query-client";

// Geist không có bộ ký tự tiếng Việt: các chữ dựng sẵn dấu thanh (ế, ộ, ả… dải U+1Exx) rơi về font
// dự phòng, nên một từ bị vẽ bằng hai font khác nhau. Be Vietnam Pro thiết kế riêng cho tiếng Việt.
const appSans = Be_Vietnam_Pro({
  variable: "--font-app-sans",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Quản lý kho",
  description: "Hệ thống quản lý kho",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className={`${appSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <QueryProvider>
          {children}
          <ToastContainer />
        </QueryProvider>
      </body>
    </html>
  );
}
