import * as cheerio from 'cheerio';
import { insertCampaignLink } from './trackingRepository';

const SKIPPED_SCHEMES = ['mailto:', 'tel:', '#'];

export function rewriteLinksForTracking(html: string, campaignId: string): string {
  const $ = cheerio.load(html, { xml: false });
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || SKIPPED_SCHEMES.some((scheme) => href.startsWith(scheme))) return;
    const linkId = insertCampaignLink(campaignId, href);
    $(el).attr('href', `__TRACK_LINK_${linkId}__`);
  });
  return $.html();
}
