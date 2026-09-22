const PIXEL_TAG = '<img src="__TRACK_PIXEL__" width="1" height="1" alt="" style="display:none !important;" />';

export function injectTrackingPixelPlaceholder(html: string): string {
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${PIXEL_TAG}</body>`);
  }
  return html + PIXEL_TAG;
}
