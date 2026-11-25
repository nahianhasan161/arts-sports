"use client";

import { useT } from "@/i18n/client";
import { DIVISIONS, districtsOf, thanasOf } from "@/lib/bd-geo";

export interface AddressValue {
  division: string;
  district: string;
  thana: string;
  line: string;
}

export const EMPTY_ADDRESS: AddressValue = { division: "", district: "", thana: "", line: "" };

const selectCls =
  "w-full h-11 px-3 rounded-lg border border-border-light bg-surface-card focus:outline-none focus:ring-1 focus:ring-primary aria-[invalid=true]:border-badge-discount text-sm disabled:bg-surface-subtle disabled:text-text-muted";

/** Division -> district -> thana dropdowns plus house/road. The value is always the English name. */
export function AddressPicker({
  value,
  onChange,
  errors = {},
}: {
  value: AddressValue;
  onChange: (next: AddressValue) => void;
  errors?: Partial<Record<keyof AddressValue, string>>;
}) {
  const { t, locale } = useT();
  const shown = (x: { name: string; bn: string }) => (locale === "bn" ? x.bn : x.name);
  const districts = value.division ? districtsOf(value.division) : [];
  const thanas = value.district ? thanasOf(value.division, value.district) : [];
  const cityThanas = thanas.filter((x) => x.dhakaCity);
  const otherThanas = thanas.filter((x) => !x.dhakaCity);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div>
        <label htmlFor="ck-division" className="block text-xs font-semibold mb-1">
          {t("buy.checkout.division")}
        </label>
        <select
          id="ck-division"
          className={selectCls}
          value={value.division}
          onChange={(e) => onChange({ ...value, division: e.target.value, district: "", thana: "" })}
          aria-invalid={Boolean(errors.division)}
        >
          <option value="">{t("buy.checkout.choose")}</option>
          {DIVISIONS.map((d) => (
            <option key={d.name} value={d.name}>
              {shown(d)}
            </option>
          ))}
        </select>
        {errors.division && <p className="text-xs text-badge-discount mt-1">{errors.division}</p>}
      </div>
      <div>
        <label htmlFor="ck-district" className="block text-xs font-semibold mb-1">
          {t("buy.checkout.district")}
        </label>
        <select
          id="ck-district"
          className={selectCls}
          value={value.district}
          disabled={!value.division}
          onChange={(e) => onChange({ ...value, district: e.target.value, thana: "" })}
          aria-invalid={Boolean(errors.district)}
        >
          <option value="">{t("buy.checkout.choose")}</option>
          {districts.map((d) => (
            <option key={d.name} value={d.name}>
              {shown(d)}
            </option>
          ))}
        </select>
        {errors.district && <p className="text-xs text-badge-discount mt-1">{errors.district}</p>}
      </div>
      <div>
        <label htmlFor="ck-thana" className="block text-xs font-semibold mb-1">
          {t("buy.checkout.thana")}
        </label>
        <select
          id="ck-thana"
          className={selectCls}
          value={value.thana}
          disabled={!value.district}
          onChange={(e) => onChange({ ...value, thana: e.target.value })}
          aria-invalid={Boolean(errors.thana)}
        >
          <option value="">{t("buy.checkout.choose")}</option>
          {cityThanas.length > 0 ? (
            <>
              <optgroup label={t("buy.checkout.dhakaCity")}>
                {cityThanas.map((x) => (
                  <option key={x.name} value={x.name}>
                    {shown(x)}
                  </option>
                ))}
              </optgroup>
              <optgroup label={t("buy.checkout.dhakaRest")}>
                {otherThanas.map((x) => (
                  <option key={x.name} value={x.name}>
                    {shown(x)}
                  </option>
                ))}
              </optgroup>
            </>
          ) : (
            thanas.map((x) => (
              <option key={x.name} value={x.name}>
                {shown(x)}
              </option>
            ))
          )}
        </select>
        {errors.thana && <p className="text-xs text-badge-discount mt-1">{errors.thana}</p>}
      </div>
      <div className="sm:col-span-3">
        <label htmlFor="ck-line" className="block text-xs font-semibold mb-1">
          {t("buy.checkout.line")}
        </label>
        <input
          id="ck-line"
          className={selectCls}
          value={value.line}
          onChange={(e) => onChange({ ...value, line: e.target.value })}
          placeholder={t("buy.checkout.linePlaceholder")}
          autoComplete="street-address"
          aria-invalid={Boolean(errors.line)}
        />
        {errors.line && <p className="text-xs text-badge-discount mt-1">{errors.line}</p>}
      </div>
    </div>
  );
}
