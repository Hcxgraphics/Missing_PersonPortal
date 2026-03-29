import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Missing Person Identification Portal",
  description: "Upload missing-person details and generate age-progressed face outputs.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
