// The mocked account's collections: real palettes the admins liked (data/admin-likes.json, read from the local data
// copy), each in the view it was liked in, grouped by mood so each row's colors look good under the pointer.
// Picked with pick-palettes.mts and pick-render.py (sheets in explore/pick-*.png).
import { ownCollection } from "../../kit/capture/mock.mjs";

/* later than the page's clock, so a pick (which keeps the later of the two times) never reorders the checklist under
   the pointer: see the report on the reorder this works around */
const LATER = Date.UTC(2026, 11, 1, 12);

const view = s => {
  const [seed, style, steps, angle] = s.split(":");
  return { seed, style, steps: Number(steps), angle: Number(angle) };
};

export const COLLECTIONS = [
  ownCollection({
    id: "promo-autumn",
    title: "Autumn evenings",
    updatedAt: LATER - 1 * 3_600_000,
    items: [
      "kaV2YVOEG_8VMQDUP0I2rZDM2twK1Jbxg:angularSwatches:21:45",
      "kYOS0gLZpDb2pvZOJsHXrI_W8pQa:linearGradient:32:90",
      "kSP0cVt8G_0_XQE:linearGradient:5:315",
      "kaQSkVsyhAUo2wJgLkHbx5BNgyPg6Lb5g:linearGradient:32:135",
      "kUMRcbNSlBdW7QJptcHA:linearSwatches:6:0",
      "kULh0XMKvAUw9wXoKELA:angularGradient:14:99",
      "kWUV7_tzxBs1HwLbQj_XqO_A:linearSwatches:13:90",
      "kYMSMAK6vBj9BwLMx0EWrvCW6uQ4:radialSwatches:6:180",
      "kW0FBC2LM90Q3vExuj4JClAA:linearSwatches:13:90",
      "kW3G89ZzU-s-0PY7vT0t0A-Y:radialGradient:7:270",
      "kaWC7XOSLJke2QbTvcC3TzA2UzwTsqEKA:linearGradient:7:90",
      "kWOCz5KKDAjWoQRGJML1qDCQ:linearGradient:32:90"
    ].map(view)
  }),
  ownCollection({
    id: "promo-ocean",
    title: "Ocean moods",
    updatedAt: LATER - 2 * 3_600_000,
    items: [
      "kWdp-8PDo-8MvvpNND-1zM_Q:linearGradient:6:0",
      "kWYGK3Pza_U9Av7cO765jI8w:linearGradient:6:180",
      "kSbzt_RiS_NcmQU:linearGradient:5:270",
      "kWVCiWv56_U-mPvdJz7bJe-o:radialSwatches:5:0",
      "kYXjusxyM5F01Plru0A8DfB2s0Qu:linearGradient:13:45",
      "kSMzq5Rkw_XUWP0:radialGradient:32:0",
      "kWJR-4Jho-b-iPZisDseJq_Q:linearGradient:7:90",
      "kWhkCKSx6_t0Zv3ulb89Za_w:linearGradient:16:45"
    ].map(view)
  }),
  ownCollection({
    id: "promo-brand",
    title: "Brand explorations",
    updatedAt: LATER - 3 * 3_600_000,
    items: [
      "kUKyy1ttPBE3axBZU8QA:linearGradient:40:135",
      "kUT2XeP-E905qwhb78IA:linearGradient:10:180",
      "kWh7_Ey1XBFJPwtXx8WXD7Dw:linearGradient:32:180",
      "kWwDuUzjPFEHYwY_aUEwmnBw:linearGradient:10:30",
      "kWp6z25jAuU_CxpG28VuNI94:angularSwatches:5:135",
      "kYlZi80MZBdBCQ7MzsSzltENDeQI:linearGradient:6:180",
      "kWsunp1mpBVTbQdZREM4TtEA:angularGradient:5:45",
      "kWqUqr2SlENe4xNVT0NVFpBw:linearGradient:5:0",
      "kcUY3HMc1BMJewFO4ME11PB108w_iMcL56W-o:linearGradient:8:0",
      "kWO1nYMj7EEVUQHOYz7zmw94:angularGradient:13:45",
      "kSk6fK0dBEtbMQ2:angularGradient:32:315",
      "kam7L-1Fu_1vKP1nLj9ah-8mGvvRQy78A:linearSwatches:7:45",
      "kUhoK_STxA1I2wjdOMLg:linearSwatches:34:135",
      "kWz1Lk48tBN9WvzVS70Ur67g:linearGradient:32:135"
    ].map(view)
  }),
  ownCollection({
    id: "promo-poster",
    title: "Poster ideas",
    updatedAt: LATER - 4 * 3_600_000,
    items: [
      "kYMjsBNLXDtTEQPpuUQ-z9Dvsxv2:linearGradient:7:90",
      "kaESq9M73LcfKw56NMkRko3TM5O2KFLSA:angularGradient:34:90",
      "kcmqIYXsPCWynQ9vm8p5K3E0yvwmpIEFlZnPI:linearGradient:8:90",
      "kUJhK8ydc_9BQTn2Cz_g:angularSwatches:4:225",
      "kSgqASEwO__oDv-:linearSwatches:3:90",
      "kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ:linearGradient:8:135"
    ].map(view)
  })
];
