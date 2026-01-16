import { t } from "./i18n";

export function getErrorMessage(error: unknown): string {
  if (!error) {
    return t("unknownError");
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function getNonce(): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i += 1) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
