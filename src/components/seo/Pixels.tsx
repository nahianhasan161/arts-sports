import Script from "next/script";
import { AttributionCapture } from "./AttributionCapture";

/**
 * Meta Pixel and GA4, each loaded only when its id is set:
 *   NEXT_PUBLIC_META_PIXEL_ID       (Events Manager -> Data sources)
 *   NEXT_PUBLIC_GA_MEASUREMENT_ID   (G-XXXXXXX)
 * Shop events go through trackEvent() in src/lib/tracking/events.ts.
 */
export function Pixels() {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim();
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
  const safe = (v: string) => v.replace(/[^A-Za-z0-9-]/g, "");

  return (
    <>
      <AttributionCapture />
      {gaId && (
        <>
          <Script id="gtag-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;gtag('js',new Date());gtag('config','${safe(gaId)}');`}
          </Script>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${safe(gaId)}`} strategy="afterInteractive" />
        </>
      )}
      {pixelId && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${safe(pixelId)}');fbq('track','PageView');`}
        </Script>
      )}
    </>
  );
}
