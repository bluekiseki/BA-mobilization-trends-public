export type ScannerSource = 'item' | 'student';

interface UploadOptions {
  source: ScannerSource;
  modelVersion: string;
}

/** Upload a consented scanner source file for model improvement. */
export async function uploadScannerSource(file: File, options: UploadOptions): Promise<boolean> {
  try {
    const response = await fetch('/api/scanner/upload', {
      method: 'POST',
      headers: {
        'Content-Type': file.type,
        'X-Scanner-Source': options.source,
        'X-Scanner-Model-Version': options.modelVersion,
        'X-Scanner-File-Size': String(file.size),
      },
      body: file,
    });
    return response.ok;
  } catch (err) {
    console.error('Scanner contribution upload error:', err);
    return false;
  }
}
