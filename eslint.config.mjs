import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [".next/**", ".open-next/**", ".wrangler/**", "node_modules/**", "next-env.d.ts"],
  },
  {
    // React Compiler advice rules (new in eslint-config-next 16). The compiler
    // is not turned on in this project, and the flagged code (load-on-mount
    // effects, functions called before their declaration, Date.now() in render)
    // works correctly. Kept as warnings so new code can follow them without the
    // ~40 existing spots blocking lint.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
    },
  },
];

export default eslintConfig;
