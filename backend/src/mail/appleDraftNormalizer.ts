import * as cheerio from 'cheerio';

// Apple Mail saves IMAP drafts with inline images embedded as
// <object type="application/x-apple-msg-attachment" data="data:...;base64,...">
// even though the same image is also present as a separate MIME part with a
// Content-ID. It only rewrites these into standard <img src="cid:..."> tags at
// actual SMTP send time — a transformation that never happens to the stored
// draft. Left as-is, the draft's huge inline data: URI would be sent verbatim
// (bloating the message and getting stripped by most webmail clients, which
// don't render <object> as an image), while the matching cid attachment goes
// unreferenced. This mirrors that send-time rewrite ourselves.
export interface InlineAttachmentRef {
  cid?: string;
  content?: Buffer;
  contentType?: string;
}

function replaceAppleInlineObjects(
  html: string,
  attachments: InlineAttachmentRef[],
  resolveSrc: (attachment: InlineAttachmentRef) => string | null,
): string {
  const candidates = attachments.filter((a) => Boolean(a.cid));
  if (candidates.length === 0) return html;

  const $ = cheerio.load(html, { xml: false });
  const objects = $('object[type="application/x-apple-msg-attachment"], object[apple-inline]');
  // Apple emits these object tags in the same document order as the matching
  // inline MIME parts, but there's no shared identifier to pair them on
  // reliably otherwise — bail out rather than guess wrong if counts disagree.
  if (objects.length === 0 || objects.length > candidates.length) return html;

  objects.each((i, el) => {
    const src = resolveSrc(candidates[i]);
    if (!src) return;
    const $el = $(el);
    const img = $('<img>').attr('src', src).attr('alt', '');
    const width = $el.attr('width');
    const height = $el.attr('height');
    if (width) img.attr('width', width);
    if (height) img.attr('height', height);
    $el.replaceWith(img);
  });

  return $.html();
}

// Used on the actual send path: the matching MIME part is attached with the
// same Content-ID, so a standard cid: reference is enough for the recipient's
// mail client to resolve it.
export function normalizeAppleInlineImages(html: string, attachments: InlineAttachmentRef[]): string {
  return replaceAppleInlineObjects(html, attachments, (a) => `cid:${a.cid}`);
}

// Used for the draft preview shown in the browser: it's rendered in a
// sandboxed iframe with no way to resolve cid: URLs, so the attachment's
// actual bytes are inlined as a data: URI instead — self-contained, and only
// used for this one preview render, not persisted or sent.
export function normalizeAppleInlineImagesForPreview(html: string, attachments: InlineAttachmentRef[]): string {
  return replaceAppleInlineObjects(html, attachments, (a) => {
    if (!a.content || !a.contentType) return null;
    return `data:${a.contentType};base64,${a.content.toString('base64')}`;
  });
}
