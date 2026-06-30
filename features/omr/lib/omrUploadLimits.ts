export const OMR_MAX_FILE_BYTES = 80 * 1024 * 1024;
export const OMR_MAX_BATCH_BYTES = 180 * 1024 * 1024;

export function formatOmrBytes(size: number) {
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)}KB`;
  return `${(size / 1024 / 1024).toFixed(1)}MB`;
}

export const OMR_MAX_FILE_LABEL = formatOmrBytes(OMR_MAX_FILE_BYTES);
export const OMR_MAX_BATCH_LABEL = formatOmrBytes(OMR_MAX_BATCH_BYTES);
