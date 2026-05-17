/**
 * Ambient declaration for puppeteer.
 *
 * Puppeteer is an *optional* peer dependency used only by the
 * `renderScorecardPdf()` path. Declaring it as `any` here lets the
 * TypeScript build succeed when puppeteer is not installed. At runtime
 * the import is wrapped in a try/catch that surfaces a clear "install
 * puppeteer to enable PDF output" error.
 */
declare module 'puppeteer';
