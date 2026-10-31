import * as React from 'react';
import { Outlet } from 'react-router-dom';
import { TooltipProvider } from '../../components/ui/tooltip';
import { Toaster } from '../../components/ui/sonner';

/**
 * The Media section shell.
 *
 * `media-scope` carries this section's design tokens and typography metrics, so
 * the rest of the dashboard — which predates Tailwind here and styles inline —
 * is completely unaffected.
 *
 * Each page below this layout has its own `RequirePage` guard in App.tsx, because
 * Media access is granted page by page. A page added here needs one too.
 */
export default function MediaLayout() {
  return (
    <div className="media-scope flex min-h-full flex-col gap-6 bg-[var(--surface)] px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <TooltipProvider delay={0}>
        <Outlet />
      </TooltipProvider>
      <Toaster />
    </div>
  );
}
