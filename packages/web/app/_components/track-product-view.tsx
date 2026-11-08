"use client";

import { useEffect } from "react";
import { trackViewItem } from "../../lib/analytics";

interface Props {
  id: string;
  name: string;
  price?: number;
  category?: string;
  store?: string;
}

export default function TrackProductView({ id, name, price, category, store }: Props) {
  useEffect(() => {
    trackViewItem({ id, name, price, category, store });
  }, [id, name, price, category, store]);

  return null;
}
