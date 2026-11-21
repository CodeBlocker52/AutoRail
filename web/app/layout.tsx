import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Libre_Baskerville } from "next/font/google";
import "./globals.css";

const serif = Libre_Baskerville({ subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"], variable: "--font-serif", display: "optional" });
const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-sans", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Autorail: Working capital for the vendors who train frontier AI", template: "%s · Autorail" },
  description:
    "Autorail turns a lab-confirmed invoice into tUSD8 working capital. Agents spend it only on approved annotators and GPUs, and the lab's payment repays lenders first, in one transaction on QDay Aevum.",
  metadataBase: new URL("https://autorail.example"),
};

export const viewport: Viewport = { themeColor: "#F8F7F3" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
