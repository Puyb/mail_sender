import multer from 'multer';
import type { AppConfig } from '../config';

export function createUploadMiddleware(config: AppConfig) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.uploads.maxFileSizeBytes },
    fileFilter: (_req, file, cb) => {
      const ext = '.' + file.originalname.split('.').pop()?.toLowerCase();
      if (!config.uploads.allowedExtensions.includes(ext)) {
        cb(new Error(`Extension non autorisée : ${ext}`));
        return;
      }
      cb(null, true);
    },
  });
}
