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

const EXTENSION_TO_IMAGE_MIME_TYPE: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  avif: 'image/avif',
  svg: 'image/svg+xml'
};

const IMAGE_MIME_TYPE_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg'
};

function buildTimestampFilename(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');

  return `${year}${month}${day}_${hour}${minute}${second}`;
}

function normalizeMimeType(contentType: string | undefined): string | undefined {
  if (!contentType) {
    return undefined;
  }

  const mimeType = contentType.split(';')[0]?.trim().toLowerCase();
  return mimeType || undefined;
}

function pickFileExtensionFromPath(sourceFilePath: string | undefined): string | undefined {
  if (!sourceFilePath) {
    return undefined;
  }

  const pathWithoutQuery = sourceFilePath.split('?')[0].split('#')[0];
  const fileName = pathWithoutQuery.split('/').pop() ?? pathWithoutQuery;
  const extensionIndex = fileName.lastIndexOf('.');

  if (extensionIndex < 0 || extensionIndex === fileName.length - 1) {
    return undefined;
  }

  return fileName.slice(extensionIndex + 1).toLowerCase();
}

function pickUploadMimeType(contentType: string | undefined, sourceFilePath: string | undefined): string {
  const mimeType = normalizeMimeType(contentType);
  if (mimeType?.startsWith('image/')) {
    return mimeType;
  }

  const extension = pickFileExtensionFromPath(sourceFilePath);
  if (extension && EXTENSION_TO_IMAGE_MIME_TYPE[extension]) {
    return EXTENSION_TO_IMAGE_MIME_TYPE[extension];
  }

  return 'image/jpeg';
}

function pickFilenameExtension(uploadMimeType: string): string {
  return IMAGE_MIME_TYPE_TO_EXTENSION[uploadMimeType] ?? 'jpg';
}

export async function uploadImageToImgBed(
  fileBuffer: Buffer,
  contentType: string | undefined,
  env: AppEnv,
  logger: Logger,
  sourceFilePath?: string
): Promise<string> {
  const uploadUrl = `${env.imgbedBaseUrl}${env.imgbedUploadPath.startsWith('/') ? '' : '/'}${env.imgbedUploadPath}`;
  const startedAt = Date.now();

  const resultUrl = await withRetry(
    async () => {
      const formData = new FormData();
      const uploadMimeType = pickUploadMimeType(contentType, sourceFilePath);
      const fileExtension = pickFilenameExtension(uploadMimeType);
      const blob = new Blob([new Uint8Array(fileBuffer)], { type: uploadMimeType });
      formData.append('file', blob, `${buildTimestampFilename()}.${fileExtension}`);

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
