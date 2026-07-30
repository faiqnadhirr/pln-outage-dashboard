import "./globals.css";
export const metadata = {
  title: "PLN Outage Intelligence — AREA1",
  description: "Top-site PLN outage & power-availability analysis for BTS power operations",
};
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
