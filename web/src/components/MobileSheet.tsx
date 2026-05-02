"use client";

import { Drawer } from "vaul";
import { useState } from "react";

export function MobileSheet({ children }: { children: React.ReactNode }) {
  const [snap, setSnap] = useState<number | string | null>(0.55);
  return (
    <Drawer.Root
      open
      modal={false}
      snapPoints={[0.12, 0.55, 0.95]}
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
      dismissible={false}
    >
      <Drawer.Portal>
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-30 flex h-[95dvh] flex-col rounded-t-[22px] frosted-strong outline-none">
          <Drawer.Title className="sr-only">Trip details</Drawer.Title>
          <div className="mx-auto my-2 h-1 w-9 rounded-full bg-ink-300/40" />
          <div className="flex-1 overflow-hidden">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
