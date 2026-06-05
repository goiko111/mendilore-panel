import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Panel — Casa Mendilore", template: "%s · Casa Mendilore" },
  description: "Panel interno de gestión de Casa Mendilore",
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
