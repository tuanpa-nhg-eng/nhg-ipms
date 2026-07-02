# NHG i18n — next-intl (vi / en)

Drop-in bilingual setup for a Next.js App Router project. Default locale is
**Vietnamese (`vi`)**; English (`en`) is served under `/en`.

## Files in this bundle

| File | Goes to (in your app) | Purpose |
|---|---|---|
| `routing.ts` | `src/i18n/routing.ts` | Locales, default, prefix strategy |
| `request.ts` | `src/i18n/request.ts` | Per-request locale + messages |
| `navigation.ts` | `src/i18n/navigation.ts` | Locale-aware `<Link>`, `useRouter`, etc. |
| `middleware.ts` | `middleware.ts` (project root) | Locale detection & routing |
| `messages/vi.json`, `messages/en.json` | `messages/` | Translation strings |

## 1. Install

```bash
npm install next-intl
```

## 2. next.config.ts — register the plugin

```ts
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default withNextIntl(nextConfig);
```

## 3. App structure (App Router)

```
app/
  [locale]/
    layout.tsx
    page.tsx
```

## 4. Root locale layout — wires font + theme + messages

```tsx
// app/[locale]/layout.tsx
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';
import { Be_Vietnam_Pro } from 'next/font/google';
import { routing } from '@/i18n/routing';

// Be Vietnam Pro with the Vietnamese subset → correct diacritics.
const beVietnamPro = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['100', '300', '400', '500', '600', '700', '800'],
  variable: '--nhg-font-loaded',
  display: 'swap',
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  return (
    <html lang={locale} className={beVietnamPro.className} suppressHydrationWarning>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
```

> Import the design tokens once (e.g. in a global `app/globals.css`):
> ```css
> @import '../styles/nhg-tokens.css';
> @import '../styles/nhg-typography.css';
> @import '../styles/nhg-base.css';
> ```

## 5. Use translations

```tsx
// Server component
import { useTranslations } from 'next-intl';

export default function Page() {
  const t = useTranslations('voice');
  return <p className="nhg-lead">{t('let_ai_carry')}</p>;
}
```

```tsx
// Locale-aware links
import { Link } from '@/i18n/navigation';
<Link href="/dashboard">{t('nav.dashboard')}</Link>;
```

## 6. Language switcher

```tsx
'use client';
import { useRouter, usePathname } from '@/i18n/navigation';
import { useLocale } from 'next-intl';

export function LanguageSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const next = locale === 'vi' ? 'en' : 'vi';
  return (
    <button className="nhg-btn nhg-btn--ghost"
      onClick={() => router.replace(pathname, { locale: next })}>
      {next.toUpperCase()}
    </button>
  );
}
```

## Notes
- Keep `vi.json` and `en.json` key-for-key identical. Add new namespaces in both.
- Switch `localePrefix` to `'always'` in `routing.ts` if you want `/vi` shown explicitly.
