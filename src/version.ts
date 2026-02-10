/**
 * Centralized version constant for CodePulse.
 *
 * Reads the version from package.json so there is a single source of
 * truth. All modules that need the version string import it from here
 * instead of hardcoding it.
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

export const VERSION: string = pkg.version;
