import type React from "react"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"
import { Navigation } from "@/components/navigation"
import { Suspense } from "react"

// Keep your metadata object - Next.js uses this to generate the <head>
export const metadata: Metadata = {
  title: "Construction Monitor App",
  description: "Created with v0",
  generator: "v0.app",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    // The className applies font variables to the whole document
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}>
      {/* NO MANUAL <head> TAG NEEDED HERE. 
        Next.js automatically creates the <head> and adds content 
        from the 'metadata' object above, plus its own necessary tags.
      */}
      <body>
        <Suspense fallback={<div>Loading...</div>}>
          <Navigation />
          {children}
          <Analytics />
        </Suspense>
      </body>
    </html>
  )
}