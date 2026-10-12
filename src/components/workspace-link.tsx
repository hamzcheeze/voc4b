"use client";

import type { ComponentProps } from "react";

type WorkspaceLinkProps = Omit<ComponentProps<"a">, "href"> & {
  href: "/" | "/history";
};

export function WorkspaceLink({
  href,
  onClick,
  children,
  ...props
}: WorkspaceLinkProps) {
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          (props.target && props.target !== "_self") ||
          props.download !== undefined
        )
          return;
        event.preventDefault();
        if (window.location.pathname !== href) {
          window.history.pushState(null, "", href);
          window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        }
      }}
    >
      {children}
    </a>
  );
}
