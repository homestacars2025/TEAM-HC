import * as React from 'react';
import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import { cn } from '../../lib/utils';

/**
 * Base UI triggers have no `asChild` — a custom element is slotted with `render`,
 * which is how the status pill can *be* its own dropdown trigger.
 */
const DropdownMenu = MenuPrimitive.Root;
const DropdownMenuTrigger = MenuPrimitive.Trigger;
const DropdownMenuGroup = MenuPrimitive.Group;

function DropdownMenuContent({
  className, children, align = 'center', sideOffset = 4, ...props
}: React.ComponentPropsWithoutRef<typeof MenuPrimitive.Popup> & {
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
}) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner className="z-50" align={align} sideOffset={sideOffset}>
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={cn(
            'media-scope max-h-[var(--available-height)] min-w-[8rem] overflow-y-auto',
            'rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10',
            'duration-100',
            'data-[open]:animate-in data-[open]:fade-in-0 data-[open]:zoom-in-95',
            'data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95',
            className,
          )}
          {...props}
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

function DropdownMenuItem({
  className, ...props
}: React.ComponentPropsWithoutRef<typeof MenuPrimitive.Item>) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(
        'relative flex cursor-default items-center gap-2 rounded-md px-1.5 py-1 text-sm outline-none select-none',
        'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

const DropdownMenuLabel = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof MenuPrimitive.GroupLabel>) => (
  <MenuPrimitive.GroupLabel className={cn('px-1.5 py-1 text-xs text-muted-foreground', className)} {...props} />
);

const DropdownMenuSeparator = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof MenuPrimitive.Separator>) => (
  <MenuPrimitive.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />
);

export {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuGroup,
  DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
};
