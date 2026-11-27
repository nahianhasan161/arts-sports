# UI Context

## Theme

Light and dark modes, switched by the `dark` class on `<html>` (`lib/theme.ts`; toggle in
`components/layout/Preferences.tsx`). A clean sports-retail look: warm off-white or deep navy surfaces,
near-black/near-white primary, **gold** accent for highlights and calls to action. The storefront is
mobile-first (most traffic comes from social apps). The admin is dense and practical; the POS register is
full-screen and touch-friendly.

The customer site has a **football theme**: `.pitch` on `<html>` (every page outside `/admin`) overrides the tokens below
with pitch greens, light and dark. Helpers: `as-pitch-lines`, `as-mown`, `as-touchline`, `as-bounce`, `<Ball />`, `<SportCard frame>` (`.as-sc`; three frames only: scoreboard, ticket, locker; frame from `frameFor()` in `lib/sport-frames.ts`; inside it use the normal token classes, they are re-pointed per frame). Home category tiles are `<CategoryTile kind>` (board, goal, track, bag; `.as-ct`, fixed colours). Home fabrics are `<FabricGoal>` (jerseys on a crossbar, `.as-fg`, fixed colours). The table
shows the base values, which the admin and POS use.

**Buttons on the customer site**: use `sp-btn sp-<item>` / `sp-ico sp-<item>` / `sp-chip` / `sp-size` from `src/app/sport-buttons.css` (list at the top of the file) and only Tailwind classes for height, width, font and layout. Meaning: goal = finish (order, pay, checkout), basketball = add to cart, cricket ball = buy now, jersey = custom jersey, ticket = view / track, whistle = retry / more, flag = back, pitch = shop / search, locker = account, red card = cancel / close / delete, yellow card = change / clear, medal = wishlist / review, shuttle = send / share. In a component shared with the admin keep the plain classes too (`.pitch` overrides them).

## Colors

Defined as RGB triplets in `src/app/globals.css` (`--c-*`, light in `:root`, dark under `.dark`), mapped in
`tailwind.config.ts` as `rgb(var(--c-name) / <alpha-value>)`, so opacity modifiers work (`bg-accent-gold/20`). Class names: `surface`, `surface-card|subtle|dim|container[-low|-high|-highest]`,
`on-surface`, `on-surface-variant`, `text-muted`, `border-light`, `primary`, `primary-container`, `accent-gold[-soft]`,
`badge-discount`, `badge-new`, `rail[-hover|-text|-muted]`, `bdt-symbol`.
**Use the Tailwind token classes, never hex or `bg-white`.**

| Role                 | CSS variable                 | Light         | Dark          |
| -------------------- | ---------------------------- | ------------- | ------------- |
| Page background      | `--c-surface`                | `252 249 248` | `14 19 25`    |
| Card                 | `--c-surface-card`           | `255 255 255` | `22 28 37`    |
| Subtle surface       | `--c-surface-subtle`         | `246 247 249` | `28 35 46`    |
| Containers (low→highest) | `--c-surface-container*` | `246…229`     | `24…44`       |
| Primary text         | `--c-on-surface`             | `27 28 28`    | `232 236 241` |
| Secondary text       | `--c-on-surface-variant`     | `68 71 76`    | `184 193 205` |
| Muted text           | `--c-text-muted`             | `107 114 128` | `148 160 176` |
| Primary (buttons)    | `--c-primary` / `-foreground`| `23 23 23` / white | `238 241 245` / `17 24 34` |
| Primary container    | `--c-primary-container`      | `30 42 56`    | `26 36 51`    |
| Accent gold          | `--c-accent-gold` / `-soft`  | `200 155 60`  | `214 170 78`  |
| Gold text (4.5:1)    | `--c-gold-ink` (`text-gold-ink`) | `128 88 16` | `214 170 78`  |
| Border               | `--c-border-light`           | `229 231 235` | `44 53 66`    |
| Discount badge       | `--c-badge-discount`         | `229 62 62`   | `245 101 101` |
| New badge            | `--c-badge-new`              | `30 42 56`    | `51 65 85`    |
| Admin rail (sidebar) | `--c-rail`, `-hover`, `-text`, `-muted` | `17 24 34` | `10 14 19` |
| ৳ symbol             | `--c-bdt-symbol`             | `51 51 51`    | `220 224 230` |

shadcn variables (`--background`, `--card`, `--border`, `--ring`, `--destructive`, `--chart-1..5`) also exist
for the base-ui primitives.

## Typography

| Role             | Font                                     | Tailwind / variable |
| ---------------- | ---------------------------------------- | ------------------- |
| Headings/display | Oswald (falls back to Hind Siliguri for Bangla) | `font-display` / `--font-oswald` |
| Body/UI          | Plus Jakarta Sans                        | `font-body` / `--font-plus-jakarta` |

Bangla is the default locale: check that layouts fit longer Bangla strings and that Bangla glyphs render.

## Border Radius

Base `--radius: 0.625rem`.

| Context                    | Class          |
| -------------------------- | -------------- |
| Inputs, small buttons, chips | `rounded-md` / `rounded-lg` |
| Cards, panels              | `rounded-lg` / `rounded-xl` |
| Modals, sheets             | `rounded-xl` / `rounded-2xl` |
| Pills, avatars, badges     | `rounded-full` |

## Component Library

shadcn-style components on **base-ui** in `src/components/ui/` (button, input, select, dialog, alert-dialog,
dropdown-menu, popover, tabs, tooltip, toast, switch, card, badge, skeleton, `confirm.tsx`, `PageSkeleton`,
`LogoLoader`, `ErrorBoundary`). Use these before writing new primitives. Ask for confirmation through
`confirm.tsx` and give feedback through `toast.tsx`.

## Layout Patterns

- **Storefront**: site header/footer (`components/layout/SiteChrome.tsx`, hidden under `/admin`); product grids use `thumbUrl()` images.
- **Admin online**: left sidebar shell (`app/admin/online/layout.tsx`) using the `rail` colours.
- **Admin offline**: top-menu shell (`app/admin/offline/layout.tsx`).
- **POS register**: full-screen; bill + numpad | product grid | payment screen (`components/admin/pos/register/`).
- **Receipts**: printable pages at `/admin/offline/pos/{receipt,custom-receipt}/[id]` (A4 printer).
- Loading: skeletons, not spinners, for page-level loads.
- Money: show `৳` with the `bdt-symbol` colour; amounts in BDT.

## Icons

`lucide-react` only (exceptions: the home promises strip uses the drawn umpire signals and sports items in `components/home/PerkArt.tsx`; filter chips use `components/ui/ChipIcon.tsx`, which adds line drawings for sports lucide lacks). Use `h-4 w-4` inline and `h-5 w-5` in buttons/nav.
- Storefront minimums: touch targets 44 px on phones, text 12 px, contrast 4.5:1, no endless animation under 768 px.
