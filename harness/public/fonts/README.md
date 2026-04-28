# Fonts Directory

Place the actual WOFF2 font files here:

- `universalSans-Regular.woff2` — Download from: https://fontsource.org/fonts/universal-sans
- `GeistMono-Regular.woff2` — Download from: https://github.com/vercel/geist-font

The dashboard CSS uses `font-display: swap` with system font fallbacks, so it
renders correctly even without these font files. However, for the full Xentient
design system, both fonts should be placed in this directory.

Note: Do not commit proprietary font files without a valid license.