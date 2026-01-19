import * as http from "node:http";
import * as https from "node:https";

import { t } from "./i18n";
import { JenkinsConfig } from "./types";

export async function triggerJenkinsBuild(
  config: JenkinsConfig,
  context: Record<string, string>
): Promise<void> {
  const baseUrl = config.url.replace(/\/+$/, "");
  const jobPath = getJenkinsJobPath(config.job);
  const params = buildJenkinsParams(config.parameters, context);
  const hasParams = Object.keys(params).length > 0;
  const endpoint = hasParams ? "buildWithParameters" : "build";
  const url = new URL(`${baseUrl}${jobPath}/${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.append(key, value);
  }

  const headers: Record<string, string> = {};
  if (config.user && config.apiToken) {
    const token = Buffer.from(`${config.user}:${config.apiToken}`).toString(
      "base64"
    );
    headers.Authorization = `Basic ${token}`;
  }
  if (config.crumb) {
    const crumb = await getJenkinsCrumb(baseUrl, headers);
    headers[crumb.field] = crumb.value;
  }

  const response = await httpRequest(url.toString(), {
    method: "POST",
    headers,
  });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(
      t("jenkinsTriggerFailed", {
        statusCode: String(response.statusCode),
        body: response.body,
      }).trim()
    );
  }
}

async function getJenkinsCrumb(
  baseUrl: string,
  headers: Record<string, string>
): Promise<{ field: string; value: string }> {
  const url = new URL(`${baseUrl}/crumbIssuer/api/json`);
  const response = await httpRequest(url.toString(), {
    method: "GET",
    headers,
  });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(
      t("jenkinsCrumbFailed", { statusCode: String(response.statusCode) })
    );
  }
  const data = JSON.parse(response.body || "{}") as {
    crumbRequestField?: string;
    crumb?: string;
  };
  if (!data.crumbRequestField || !data.crumb) {
    throw new Error(t("jenkinsCrumbInvalid"));
  }
  return { field: data.crumbRequestField, value: data.crumb };
}

function getJenkinsJobPath(job: string): string {
  const segments = job.split("/").map((part) => part.trim()).filter(Boolean);
  if (segments.length === 0) {
    throw new Error(t("jenkinsJobEmpty"));
  }
  return `/job/${segments.map(encodeURIComponent).join("/job/")}`;
}

function buildJenkinsParams(
  parameters: Record<string, string> | undefined,
  context: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!parameters) {
    return result;
  }
  for (const [key, value] of Object.entries(parameters)) {
    result[key] = interpolateTemplate(String(value), context);
  }
  return result;
}

function interpolateTemplate(
  input: string,
  context: Record<string, string>
): string {
  return input.replace(/\$\{(\w+)\}/g, (_, key) => context[key] ?? "");
}

async function httpRequest(
  url: string,
  options: { method: string; headers?: Record<string, string> }
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const transport = target.protocol === "https:" ? https : http;
    const req = transport.request(
      target,
      {
        method: options.method,
        headers: options.headers,
      },
      (res: any) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode || 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}
