// Known automated fetchers that load tracking pixels / follow links without a human ever
// reading the email: corporate mail-security link/image scanners (which prefetch every
// pixel and link at delivery time, regardless of whether the recipient opens the message),
// generic web crawlers, uptime monitors, and headless/HTTP-client tooling.
const BOT_UA_PATTERNS: RegExp[] = [
  /bot\b/i,
  /crawl/i,
  /spider/i,
  /slurp/i,
  /headless/i,
  /phantomjs/i,
  /puppeteer/i,
  /playwright/i,
  /selenium/i,
  /scrapy/i,
  /python-requests/i,
  /python-urllib/i,
  /curl\//i,
  /wget\//i,
  /libwww-perl/i,
  /go-http-client/i,
  /okhttp/i,
  /node-fetch/i,
  /axios\//i,
  /java\//i,
  /httpclient/i,
  // corporate email-security link/image scanners (fetch on delivery, not on human open)
  /safelinks/i,
  /mimecast/i,
  /proofpoint/i,
  /barracuda/i,
  /forcepoint/i,
  /fireeye/i,
  /ironport/i,
  /trendmicro/i,
  /messagelabs/i,
  /symantec/i,
  /zscaler/i,
  /checkpoint/i,
  /fortinet/i,
  // link-preview bots from chat/social apps
  /facebookexternalhit/i,
  /whatsapp/i,
  /telegrambot/i,
  /slackbot/i,
  /discordbot/i,
  /linkedinbot/i,
  /twitterbot/i,
  /skypeuripreview/i,
  // uptime / synthetic monitoring
  /uptimerobot/i,
  /pingdom/i,
  /statuscake/i,
  /site24x7/i,
  /freshping/i,
  // search engine / SEO crawlers
  /bingpreview/i,
  /adsbot-google/i,
  /mj12bot/i,
  /ahrefsbot/i,
  /semrushbot/i,
  /dotbot/i,
  /yandexbot/i,
  /baiduspider/i,
  /bytespider/i,
];

export function isBotUserAgent(userAgent?: string | null): boolean {
  // Scanners and simple HTTP clients frequently omit a User-Agent entirely; treat that as a bot too.
  if (!userAgent || userAgent.trim().length === 0) return true;
  return BOT_UA_PATTERNS.some((pattern) => pattern.test(userAgent));
}
