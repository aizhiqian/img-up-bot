import { AppEnv } from '../config/env';
import { Logger } from '../utils/logger';
import { createHttpError, fetchWithTimeout, readJsonSafe, truncateText, withRetry } from '../utils/http';

type ImgBedUploadResponse =
  | {
      data?: Array<{
        src?: string;
      }>;
      src?: string;
      message?: string;
    }
  | Array<{
      src?: string;
    }>;

function joinUrl(baseUrl: string, pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }

  const normalizedPath = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${baseUrl}${normalizedPath}`;
}

function pickSrcFromResponse(json: ImgBedUploadResponse | null): string | undefined {
  if (!json) {
    return undefined;
  }

  if (Array.isArray(json)) {
    return typeof json[0]?.src === 'string' ? json[0].src : undefined;
  }

  if (typeof json.src === 'string') {
    return json.src;
  }

  return typeof json.data?.[0]?.src === 'string' ? json.data[0].src : undefined;
}

export async function uploadImageToImgBed(
  fileBuffer: Buffer,
  contentType: string | undefined,
  env: AppEnv,
  logger: Logger
): Promise<string> {
  const uploadUrl = `${env.imgbedBaseUrl}${env.imgbedUploadPath.startsWith('/') ? '' : '/'}${env.imgbedUploadPath}`;
  const startedAt = Date.now();

  const resultUrl = await withRetry(
    async () => {
      const formData = new FormData();
      const blob = new Blob([new Uint8Array(fileBuffer)], { type: contentType ?? 'application/octet-stream' });
      formData.append('file', blob, 'telegram-image.jpg');

      const response = await fetchWithTimeout(
        uploadUrl,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.imgbedUploadToken}`
          },
          body: formData
        },
        env.requestTimeoutMs
      );

      const text = await response.text();
      const json = readJsonSafe(text) as ImgBedUploadResponse | null;

      if (!response.ok) {
        throw createHttpError(`ImgBed upload HTTP ${response.status}`, {
          retryable: response.status >= 500 || response.status === 429,
          status: response.status,
          cause: truncateText(text)
        });
      }

      const src = pickSrcFromResponse(json);
      if (!src || typeof src !== 'string') {
        throw createHttpError(`ImgBed upload invalid response: ${truncateText(text)}`, {
          retryable: false
        });
      }

      return joinUrl(env.imgbedBaseUrl, src);
    },
    {
      maxAttempts: env.retryMaxAttempts
    }
  );

  logger.info('imgbed_upload_success', {
    bytes: fileBuffer.length,
    uploaded_url: resultUrl,
    cost_ms: Date.now() - startedAt
  });

  return resultUrl;
}
