import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  // 'vi' first → Vietnamese is the default for NHG.
  locales: ['vi', 'en'],
  defaultLocale: 'vi',
  // 'as-needed' keeps the default locale at the root (/) and prefixes /en.
  // Use 'always' if you prefer /vi and /en both prefixed.
  localePrefix: 'as-needed',
});

export type Locale = (typeof routing.locales)[number];
