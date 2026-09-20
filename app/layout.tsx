import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Softnix LineDev Console",
  description: "คอนโซลผู้ดูแล Agent สำหรับ LINE Flex Message",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
