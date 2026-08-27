import * as React from 'react';
import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import { cn } from '../../lib/utils';

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

/**
 * `sideOffset` and `side` land on the positioner, the styling on the popup —
 * Base UI splits placement from presentation, unlike Radix's single Content part.
 */
function TooltipContent({
  className, children, side = 'top', sideOffset = 6, ...props
}: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Popup> & {
  side?: 'top' | 'right' | 'bottom' | 'left';
  sideOffset?: number;
}) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner side={side} sideOffset={sideOffset} className="z-50">
        <TooltipPrimitive.Popup
          className={cn(
            'media-scope rounded-md bg-foreground px-3 py-1.5 text-xs text-background',
            'transition-[transform,opacity] duration-150',
            'data-[starting-style]:opacity-0 data-[ending-style]:opacity-0',
            'data-[side=top]:data-[starting-style]:translate-y-1',
            'data-[side=bottom]:data-[starting-style]:-translate-y-1',
            className,
          )}
          {...props}
        >
          <TooltipPrimitive.Arrow className="size-2.5 rotate-45 rounded-[2px] bg-foreground" />
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
