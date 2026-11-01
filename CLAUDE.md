# HomestaCars Team Dashboard

## Project Overview
Team dashboard for HomestaCars — accessible at team.homestacars.com. Used by both admin and staff roles. Access is restricted to users where `profiles.role = 'admin'` OR `profiles.role = 'staff'`.

HomestaCars is a premium car rental company based in Istanbul, Turkey (founded 2025), with two branches in Şişli and Kayaşehir. The company focuses on quality and modern customer experience, ranging from economy to luxury vehicles. Behind the scenes it manages investor-owned vehicles.

## Tech Stack
- React (TypeScript)
- Supabase (database + auth)
- Target: zero bugs, fast performance, professional UI

## Design Direction
- Modern, clean, premium aesthetic — Apple meets Airbnb
- Brand color: #4ba6ea
- Language: English
- No generic AI patterns — distinctive, memorable UI

## Design Rules
- Stat tiles double as filters; no separate filter chip rows. Pressing a tile filters the list, pressing the active tile clears it, and an "All" tile always shows everything.
- Filter tiles use `StatTile` with `onPress` and `pressed`, plus `useTileFilter` to keep the choice in the URL (`?filter=unpaid`). They are buttons with `aria-pressed`. The active tile gets a 2px border in its own color, a stronger tint and a check badge.
- A tile with nothing to filter stays a plain `StatTile`. Filters with too many values for tiles go in a dropdown beside the search, which sits below the tiles.
- Tile sizing: compact on desktop (about 140px high, at most 220px wide, row at most 900px), 2 per row on mobile with short tiles (about 1.2/1), never tall empty tiles. Show count and amount where both apply.

## Architecture
- /src/components — reusable UI components
- /src/pages — dashboard pages
- /src/lib — supabase client and utilities
- /src/types — TypeScript interfaces

## Supabase Config
- Store credentials in .env file only — never hardcode
- REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY

## Code Rules
- ALWAYS use TypeScript strictly
- NEVER hardcode credentials
- ALWAYS handle loading and error states
- ALWAYS use React Query or useEffect with cleanup for data fetching
- NEVER leave console.log in production code
- Use meaningful component and variable names
- ALL Supabase table names, view names, and column names are ALWAYS lowercase — no exceptions
- ALL pages and components MUST be fully responsive: desktop, tablet, and mobile
- Use Tailwind responsive prefixes: sm: md: lg: xl:
- Mobile first approach always
- Sidebar: hidden on mobile (hamburger menu), visible on tablet/desktop
- Tables: horizontal scroll on mobile, full view on desktop
- Cards: 1 column mobile, 2 columns tablet, 3 columns desktop
- Font sizes scale down on mobile
- Touch-friendly tap targets (min 44px height) on mobile

## Workflow
- For each task: run tsc, the build, the tests related to the changed files, and a quick browser check of the touched pages (desktop and mobile, AR and EN where relevant). Then commit and push to main immediately.
- Do not run the full regression suite (all specs, both engines) before a push. Run it only when asked, or at most once a day in the background after pushing, and report any failures.
- If a full gate is running for finished work, stop waiting: push now and let it finish in the background.

## Goals
- Zero technical bugs
- Fast performance — no waterfalls
- Clean Supabase integration
- AI-ready architecture for future automation
