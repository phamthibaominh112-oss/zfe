import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZE CenterOS",
  description: "ZEST for English academic and operations management platform"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body>{children}</body></html>;
}
