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

## Goals
- Zero technical bugs
- Fast performance — no waterfalls
- Clean Supabase integration
- AI-ready architecture for future automation
