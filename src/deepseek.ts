import { t } from "./i18n";

export interface DeepseekSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
}

interface DeepseekResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
    text?: string;
  }>;
  error?: {
    message?: string;
  };
  message?: string;
}

function resolveEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return "https://api.deepseek.com/v1/chat/completions";
  }
  if (trimmed.endsWith("/chat/completions")) {
    return trimmed;
  }
  if (trimmed.endsWith("/v1")) {
    return `${trimmed}/chat/completions`;
  }
  return `${trimmed}/v1/chat/completions`;
}

export async function translateToEnglish(
  text: string,
  settings: DeepseekSettings
): Promise<string> {
  const endpoint = resolveEndpoint(settings.baseUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          {
            role: "system",
            content:
              "Translate the user's Chinese requirement into a concise English phrase for a git branch name. Output only the phrase in lowercase words separated by spaces. Do not add punctuation, quotes, or extra explanations.",
          },
          {
            role: "user",
            content: text,
          },
        ],
        temperature: 0.2,
      }),
      signal: controller.signal,
    });
    const data = (await response.json().catch(() => null)) as
      | DeepseekResponse
      | null;
    if (!response.ok) {
      const errorMessage =
        data?.error?.message ||
        data?.message ||
        `${response.status} ${response.statusText}`;
      throw new Error(t("deepseekRequestFailed", { error: errorMessage }));
    }
    const content =
      data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? "";
    if (!content || typeof content !== "string") {
      throw new Error(t("deepseekEmpty"));
    }
    return content.trim();
  } finally {
    clearTimeout(timeout);
  }
}
