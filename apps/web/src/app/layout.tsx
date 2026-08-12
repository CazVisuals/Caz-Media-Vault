import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Caz Media Vault",
  description: "Your private home cinema.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
