export const metadata = {
  title: "Uninorte – Horarios + Grafos",
  description: "Proyección de horarios con grafos",
};

import "./globals.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body style={{ background: "#f9fafb" }}>{children}</body>
    </html>
  );
}
