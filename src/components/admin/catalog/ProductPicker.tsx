"use client";

import { useEffect, useMemo, useState } from "react";

interface Item {
  id: string;
  title: string;
  slug: string;
  status: string;
}

/** Search-and-tick list of products, for attaching them to a term or collection. */
export function ProductPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/admin/product-list")
      .then((r) => r.json())
      .then((j) => setItems(j.products ?? []))
      .catch(() => {});
  }, []);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items.filter((i) => !term || i.title.toLowerCase().includes(term));
  }, [items, q]);

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <div className="border border-border-light rounded-lg">
      <div className="p-2 border-b border-border-light flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search products"
          className="flex-1 px-2 py-1 text-sm bg-surface-subtle rounded border border-border-light"
        />
        <span className="text-xs text-text-muted">{value.length} selected</span>
      </div>
      <ul className="max-h-56 overflow-y-auto divide-y divide-border-light">
        {shown.map((i) => (
          <li key={i.id}>
            <label className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-surface-subtle">
              <input type="checkbox" checked={value.includes(i.id)} onChange={() => toggle(i.id)} />
              <span className="flex-1 truncate">{i.title}</span>
              {i.status !== "published" && <span className="text-[10px] uppercase text-text-muted">{i.status}</span>}
            </label>
          </li>
        ))}
        {shown.length === 0 && <li className="px-3 py-4 text-xs text-text-muted text-center">No products</li>}
      </ul>
    </div>
  );
}
