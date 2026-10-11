import { existsSync } from "node:fs";
import { loadESLint } from "eslint";

// Preserve next lint's default directories, extensions, and .eslintrc rules.
// The installed Next.js config is legacy; use ESLint's supported API directly
// rather than the deprecated next lint or legacy-config CLI entrypoints.
const directories = ["pages", "app", "components", "lib", "src"].filter(existsSync);
const ESLint = await loadESLint({ useFlatConfig: false });
const eslint = new ESLint({
  extensions: [".js", ".jsx", ".ts", ".tsx"],
  errorOnUnmatchedPattern: false,
  cache: true,
  cacheLocation: ".next/cache/eslint/",
});
const results = await eslint.lintFiles(directories);
const formatter = await eslint.loadFormatter("stylish");
const output = formatter.format(results);
if (output) console.log(output);
if (results.some((result) => result.errorCount > 0)) process.exitCode = 1;
