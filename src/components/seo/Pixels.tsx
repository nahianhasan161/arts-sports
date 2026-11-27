import Script from "next/script";
import { AttributionCapture } from "./AttributionCapture";
import { RouteTracker } from "./RouteTracker";

/**
 * Ad and analytics tags, each loaded only when its id is set (see .env.example):
 *   NEXT_PUBLIC_GTM_ID              Google Tag Manager (GTM-XXXXXXX)
 *   NEXT_PUBLIC_GTM_SERVER_URL      optional: a server-side GTM container's own
 *                                   address (e.g. https://sgtm.artssports.com),
 *                                   gtm.js is then loaded from there (first party)
 *   NEXT_PUBLIC_GA_MEASUREMENT_ID   GA4 (G-XXXXXXX)
 *   NEXT_PUBLIC_META_PIXEL_ID       Meta Pixel
 *   NEXT_PUBLIC_TIKTOK_PIXEL_ID     TikTok Pixel
 *   NEXT_PUBLIC_PINTEREST_TAG_ID    Pinterest Tag
 *
 * A tag set up inside GTM must not have its id here too, or it counts twice.
 * Shop events go through trackEvent() in src/lib/tracking/events.ts, which
 * feeds every tag (and GTM's dataLayer) with the same event id.
 */
/** Staff screens (admin, POS, product preview) are not shop traffic: no tag runs there. */
const run = (js: string) => `if(location.pathname.indexOf("/admin")!==0&&location.pathname.indexOf("/preview/")!==0){${js}}`;

export function Pixels() {
  const safe = (v: string | undefined) => (v ?? "").trim().replace(/[^A-Za-z0-9-]/g, "");
  const gtmId = safe(process.env.NEXT_PUBLIC_GTM_ID);
  const gtmBase = (process.env.NEXT_PUBLIC_GTM_SERVER_URL ?? "").trim().replace(/\/+$/, "");
  const gtmHost = /^https:\/\/[a-z0-9.-]+$/i.test(gtmBase) ? gtmBase : "https://www.googletagmanager.com";
  const gaId = safe(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID);
  const pixelId = safe(process.env.NEXT_PUBLIC_META_PIXEL_ID);
  const tiktokId = safe(process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID);
  const pinterestId = safe(process.env.NEXT_PUBLIC_PINTEREST_TAG_ID);

  return (
    <>
      <AttributionCapture />
      <RouteTracker />
      {gtmId && (
        <>
          <Script id="gtm" strategy="afterInteractive">
            {run(`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='${gtmHost}/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtmId}');`)}
          </Script>
          <noscript>
            <iframe
              src={`${gtmHost}/ns.html?id=${gtmId}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
              title="Google Tag Manager"
            />
          </noscript>
        </>
      )}
      {gaId && (
        <>
          <Script id="gtag-init" strategy="afterInteractive">
            {run(`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;gtag('js',new Date());gtag('config','${gaId}');`)}
          </Script>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} strategy="afterInteractive" />
        </>
      )}
      {pixelId && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {run(`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixelId}');fbq('track','PageView');`)}
        </Script>
      )}
      {tiktokId && (
        <Script id="tiktok-pixel" strategy="afterInteractive">
          {run(`!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script");n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};ttq.load('${tiktokId}');ttq.page();}(window,document,'ttq');`)}
        </Script>
      )}
      {pinterestId && (
        <Script id="pinterest-tag" strategy="afterInteractive">
          {run(`!function(e){if(!window.pintrk){window.pintrk=function(){window.pintrk.queue.push(Array.prototype.slice.call(arguments))};var n=window.pintrk;n.queue=[],n.version="3.0";var t=document.createElement("script");t.async=!0,t.src=e;var r=document.getElementsByTagName("script")[0];r.parentNode.insertBefore(t,r)}}("https://s.pinimg.com/ct/core.js");pintrk('load','${pinterestId}');pintrk('page');`)}
        </Script>
      )}
    </>
  );
}
