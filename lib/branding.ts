// Names shown in the app and printed on documents. Change the spelling here only.

/** Printed as the document heading and used as the app name. */
export const DOCUMENT_TITLE = "Performa Invoice";

/** Browser tab / app name. */
export const APP_NAME = `Sascan ${DOCUMENT_TITLE}`;

/** e.g. "New quotation · Sascan Performa Invoice" */
export function pageTitle(page: string): string {
  return `${page} · ${APP_NAME}`;
}
