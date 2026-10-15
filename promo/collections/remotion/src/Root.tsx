import type React from "react";
import { Composition } from "remotion";
import { Promo, type PromoProps, promoLength } from "./Promo";

const tweet = { width: 1280, height: 720, fps: 30 };
/* the newsletter's column is 534 pixels (packages/email: two 300 pixel cards less the sheet's padding); drawn at
   twice that and scaled down for the GIF */
const email = { width: 1068, height: 600, fps: 30 };

/* one composition per variant and theme; the words are an option, 1 to 6 (copy.ts), passed with --props */
export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Tweet" component={Promo} durationInFrames={promoLength("tweet")} {...tweet} defaultProps={{ theme: "dark", variant: "tweet", option: 1 } satisfies PromoProps} />
    <Composition id="TweetLight" component={Promo} durationInFrames={promoLength("tweet")} {...tweet} defaultProps={{ theme: "light", variant: "tweet", option: 1 } satisfies PromoProps} />
    <Composition id="Email" component={Promo} durationInFrames={promoLength("email")} {...email} defaultProps={{ theme: "dark", variant: "email", option: 1 } satisfies PromoProps} />
    <Composition id="EmailLight" component={Promo} durationInFrames={promoLength("email")} {...email} defaultProps={{ theme: "light", variant: "email", option: 1 } satisfies PromoProps} />
  </>
);
