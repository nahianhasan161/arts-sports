"use client";

import { DIVISIONS, districtsOf, thanasOf } from "@/lib/bd-geo";

export interface AddressValue {
  division: string;
  district: string;
  thana: string;
  line: string;
}

export const EMPTY_ADDRESS: AddressValue = { division: "", district: "", thana: "", line: "" };

const selectCls =
  "w-full h-10 px-3 rounded-lg border border-border-light bg-white focus:outline-none focus:ring-1 focus:ring-primary text-sm disabled:bg-surface-subtle disabled:text-text-muted";

/** Division -> district -> thana dropdowns plus house/road, in English with Bangla beside. */
export function AddressPicker({
  value,
  onChange,
  errors = {},
}: {
  value: AddressValue;
  onChange: (next: AddressValue) => void;
  errors?: Partial<Record<keyof AddressValue, string>>;
}) {
  const districts = value.division ? districtsOf(value.division) : [];
  const thanas = value.district ? thanasOf(value.division, value.district) : [];
  const cityThanas = thanas.filter((t) => t.dhakaCity);
  const otherThanas = thanas.filter((t) => !t.dhakaCity);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div>
        <label htmlFor="ck-division" className="block text-xs font-semibold mb-1">
          Division <span className="text-text-muted font-normal">· বিভাগ</span>
        </label>
        <select
          id="ck-division"
          className={selectCls}
          value={value.division}
          onChange={(e) => onChange({ ...value, division: e.target.value, district: "", thana: "" })}
          aria-invalid={Boolean(errors.division)}
        >
          <option value="">Choose…</option>
          {DIVISIONS.map((d) => (
            <option key={d.name} value={d.name}>
              {d.name} · {d.bn}
            </option>
          ))}
        </select>
        {errors.division && <p className="text-[11px] text-badge-discount mt-1">{errors.division}</p>}
      </div>
      <div>
        <label htmlFor="ck-district" className="block text-xs font-semibold mb-1">
          District <span className="text-text-muted font-normal">· জেলা</span>
        </label>
        <select
          id="ck-district"
          className={selectCls}
          value={value.district}
          disabled={!value.division}
          onChange={(e) => onChange({ ...value, district: e.target.value, thana: "" })}
          aria-invalid={Boolean(errors.district)}
        >
          <option value="">Choose…</option>
          {districts.map((d) => (
            <option key={d.name} value={d.name}>
              {d.name} · {d.bn}
            </option>
          ))}
        </select>
        {errors.district && <p className="text-[11px] text-badge-discount mt-1">{errors.district}</p>}
      </div>
      <div>
        <label htmlFor="ck-thana" className="block text-xs font-semibold mb-1">
          Thana / Area <span className="text-text-muted font-normal">· থানা</span>
        </label>
        <select
          id="ck-thana"
          className={selectCls}
          value={value.thana}
          disabled={!value.district}
          onChange={(e) => onChange({ ...value, thana: e.target.value })}
          aria-invalid={Boolean(errors.thana)}
        >
          <option value="">Choose…</option>
          {cityThanas.length > 0 ? (
            <>
              <optgroup label="Dhaka city">
                {cityThanas.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name} · {t.bn}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Rest of Dhaka district">
                {otherThanas.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name} · {t.bn}
                  </option>
                ))}
              </optgroup>
            </>
          ) : (
            thanas.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name} · {t.bn}
              </option>
            ))
          )}
        </select>
        {errors.thana && <p className="text-[11px] text-badge-discount mt-1">{errors.thana}</p>}
      </div>
      <div className="sm:col-span-3">
        <label htmlFor="ck-line" className="block text-xs font-semibold mb-1">
          House, road, area <span className="text-text-muted font-normal">· বাসা / রোড</span>
        </label>
        <input
          id="ck-line"
          className={selectCls}
          value={value.line}
          onChange={(e) => onChange({ ...value, line: e.target.value })}
          placeholder="e.g. House 12, Road 5, Block C, Banasree"
          autoComplete="street-address"
          aria-invalid={Boolean(errors.line)}
        />
        {errors.line && <p className="text-[11px] text-badge-discount mt-1">{errors.line}</p>}
      </div>
    </div>
  );
}
