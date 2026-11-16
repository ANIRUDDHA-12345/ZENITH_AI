export const MAX_ATTACHMENTS = 4;
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const MAX_DOCUMENT_CHARACTERS = 20_000;
const MAX_PDF_PAGES = 20;
const MAX_IMAGE_DIMENSION = 1536;
const MAX_COMPRESSED_IMAGE_BYTES = 1_800_000;

function extensionOf(name) {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('The selected image could not be processed.'));
    }, 'image/webp', quality);
  });
}

async function compressImage(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`${file.name} could not be opened as an image.`);
  }

  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('Your browser could not process the selected image.');
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  let blob = await canvasToBlob(canvas, 0.82);
  if (blob.size > MAX_COMPRESSED_IMAGE_BYTES) blob = await canvasToBlob(canvas, 0.62);
  if (blob.size > MAX_COMPRESSED_IMAGE_BYTES) throw new Error(`${file.name} is too large to attach after compression.`);
  return blob;
}

async function extractPdfText(file) {
  const [{ getDocument, GlobalWorkerOptions }, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  GlobalWorkerOptions.workerSrc = worker.default;
  const document = await getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= Math.min(document.numPages, MAX_PDF_PAGES); pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => 'str' in item ? item.str : '').join(' '));
  }
  const text = pages.join('\n\n').trim();
  if (!text) throw new Error(`${file.name} has no selectable text. Scanned PDFs are not supported yet.`);
  return document.numPages > MAX_PDF_PAGES ? `${text}\n\n[PDF truncated after the first ${MAX_PDF_PAGES} pages.]` : text;
}

async function extractDocumentText(file, extension) {
  if (extension === 'pdf') return extractPdfText(file);
  if (extension === 'docx') {
    const mammoth = await import('mammoth/mammoth.browser.js');
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return result.value;
  }
  return file.text();
}

export async function prepareAttachment(file, mode) {
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} exceeds the 12 MB attachment limit.`);
  const extension = extensionOf(file.name);
  const isImage = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);

  if (isImage) {
    const blob = await compressImage(file);
    return {
      id: crypto.randomUUID(),
      kind: 'image',
      name: file.name,
      mimeType: blob.type,
      blob,
      size: blob.size,
    };
  }
  if (mode === 'image') throw new Error('Image creation accepts reference images only.');
  if (!['pdf', 'docx', 'txt', 'md', 'csv', 'json'].includes(extension)) {
    throw new Error(`${file.name} is not a supported file. Attach an image, PDF, DOCX, TXT, MD, CSV, or JSON file.`);
  }

  const text = (await extractDocumentText(file, extension)).trim();
  if (!text) throw new Error(`${file.name} contains no readable text.`);
  const truncated = text.length > MAX_DOCUMENT_CHARACTERS;
  return {
    id: crypto.randomUUID(),
    kind: 'document',
    name: file.name,
    mimeType: file.type || 'text/plain',
    text: truncated ? `${text.slice(0, MAX_DOCUMENT_CHARACTERS)}\n\n[Document text truncated.]` : text,
    truncated,
  };
}
