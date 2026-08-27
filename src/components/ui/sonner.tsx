import * as React from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { CircleCheck, Info, TriangleAlert, OctagonX, Loader2 } from 'lucide-react';

/** Mounted once, at the app root. Colours come from the section's design tokens. */
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="top-right"
      richColors
      closeButton
      icons={{
        success: <CircleCheck className="size-4" />,
        info: <Info className="size-4" />,
        warning: <TriangleAlert className="size-4" />,
        error: <OctagonX className="size-4" />,
        loading: <Loader2 className="size-4 animate-spin" />,
      }}
      style={{
        '--normal-bg': 'rgb(var(--m-popover))',
        '--normal-text': 'rgb(var(--m-popover-foreground))',
        '--normal-border': 'rgb(var(--m-border))',
        '--border-radius': 'var(--m-radius)',
      } as React.CSSProperties}
      toastOptions={{ classNames: { toast: 'cn-toast' } }}
      {...props}
    />
  );
}
