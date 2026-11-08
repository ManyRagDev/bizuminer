"use client";

import type { ReactNode } from "react";
import { trackAffiliateClick } from "../../lib/analytics";

interface Props {
  href: string;
  className?: string;
  id: string;
  name?: string;
  store?: string;
  price?: number;
  children: ReactNode;
}

export default function AffiliateLink({
  href,
  className,
  id,
  name,
  store,
  price,
  children,
}: Props) {
  return (
    <a
      href={href}
      className={className}
      target="_blank"
      rel="noreferrer sponsored"
      onClick={() => {
        trackAffiliateClick({
          id,
          name,
          store,
          destinationUrl: href,
          price,
        });
      }}
    >
      {children}
    </a>
  );
}
