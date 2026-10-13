/* The flags the language menus draw (Flag), at 3:2: each its viewBox and the markup inside its <svg>. A flag is
   data, not styling, so its colors are its own. Taken unchanged from country-flag-icons 1.6.20 (3x2),
   https://gitlab.com/catamphetamine/country-flag-icons, under its license:

   (The MIT License)

   Copyright (c) 2020 @catamphetamine <purecatamphetamine@gmail.com>

   Permission is hereby granted, free of charge, to any person obtaining
   a copy of this software and associated documentation files (the
   'Software'), to deal in the Software without restriction, including
   without limitation the rights to use, copy, modify, merge, publish,
   distribute, sublicense, and/or sell copies of the Software, and to
   permit persons to whom the Software is furnished to do so, subject to
   the following conditions:

   The above copyright notice and this permission notice shall be
   included in all copies or substantial portions of the Software.

   THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
   EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
   MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
   IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
   CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
   TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
   SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE. */
export const FLAGS = {
  br: { viewBox: "0 0 513 342", body: '<path fill="#009b3a" d="M0 0h513v342H0z"/><path fill="#fedf00" d="m256.5 19.3 204.9 151.4L256.5 322 50.6 170.7z"/><circle fill="#FFF" cx="256.5" cy="171" r="80.4"/><path fill="#002776" d="M215.9 165.7c-13.9 0-27.4 2.1-40.1 6 .6 43.9 36.3 79.3 80.3 79.3 27.2 0 51.3-13.6 65.8-34.3-24.9-31-63.2-51-106-51zM334.9 186c.9-5 1.5-10.1 1.5-15.4 0-44.4-36-80.4-80.4-80.4-33.1 0-61.5 20.1-73.9 48.6 10.9-2.2 22.1-3.4 33.6-3.4 46.8.1 89 19.5 119.2 50.6z"/>' },
  cn: { viewBox: "0 0 513 342", body: '<path fill="#D80027" d="M0 0h513v342H0z"/><g fill="#FFDA44"><path d="m226.8 239.2-9.7-15.6-17.9 4.4 11.9-14.1-9.7-15.6 17.1 6.9 11.8-14.1-1.3 18.4 17.1 6.9-17.9 4.4zM290.6 82l-10.1 15.4 11.6 14.3-17.7-4.8-10.1 15.5-1-18.4-17.7-4.8 17.2-6.6-1-18.4 11.6 14.3zM236.2 25.4l-2 18.3 16.8 7.6-18 3.8-2 18.3-9.2-16-17.9 3.8 12.3-13.7-9.2-15.9 16.8 7.5zM292.8 161.8l-14.9 10.9 5.8 17.5-14.9-10.8-14.9 11 5.6-17.6-14.9-10.7 18.4-.1 5.6-17.6 5.8 17.5zM115 46.3l17.3 53.5h56.2l-45.4 32.9 17.3 53.5-45.4-33-45.5 33 17.4-53.5-45.5-32.9h56.3z"/></g>' },
  de: { viewBox: "0 0 513 342", body: '<path fill="#D80027" d="M0 0h513v342H0z"/><path d="M0 0h513v114H0z"/><path fill="#FFDA44" d="M0 228h513v114H0z"/>' },
  eg: { viewBox: "0 0 513 342", body: '<path fill="#FFF" d="M0 0h513v342H0z"/><path fill="#D80027" d="M0 0h513v114H0z"/><path d="M0 228h513v114H0z"/><path fill="#C09300" d="M220.3 204.4s0-58.4 4.5-64.7c3.1-4.3 16.8 5.2 22.7 4.5 0 0 4.2-7.5 4.5-12 .3-4.6-1.1-7.6-4.9-6.2 0 0-1.2-2.1.5-3.3 1.6-1.2 5.6.1 5.6.1s-.5-1 1.6-.9c2.9.2 7.2 1.4 7.4 5.6.2 3.1.3 7.7.4 8.7.7 6.8 2.7 8.7 2.7 8.7s18.4-9.2 22-5.2c3.3 3.8 4.5 64.7 4.5 64.7l-18.1-16.8 12.1 29.5s-14.4 2.4-28.9 2.4c-14.5 0-31.1-4.2-31.1-4.2l13.8-28.2-19.3 17.3z"/>' },
  fr: { viewBox: "0 0 513 342", body: '<path fill="#FFF" d="M0 0h513v342H0z"/><path fill="#00318A" d="M0 0h171v342H0z"/><path fill="#D80027" d="M342 0h171v342H342z"/>' },
  id: { viewBox: "0 0 513 342", body: '<path fill="#FFF" d="M0 0h513v342H0z"/><path fill="#E00" d="M0 0h513v171H0z"/>' },
  ir: { viewBox: "0 0 513 342", body: '<path fill="#FFF" d="M0 0h512v342H0z"/><path fill="#6DA544" d="M0 0h513v114H0z"/><g fill="#D80027"><path d="M0 227.9h513v114H0zM278.8 134.8c.1 2 8.7 26.2 4.4 39.4-6.6 20.3-15.8 21.8-19.8 24.5V134l-6.9-4.2-6.9 4.2v64.7c-4-2.7-12.4-2.4-19.8-24.5-4.3-12.7 5.7-37.3 5.8-39.2 0 0-9.5 8.1-15.8 24-5.9 14.8 1.9 49.6 29.5 54.8 2.3.4 4.7 5.6 7.2 5.6 2.1 0 4.1-5.2 6-5.5 28.4-4.6 35-41.7 29.9-55.6-5.4-14.6-13.6-23.5-13.6-23.5z"/></g><g fill="#FFF" opacity=".5"><path d="M44.6 98.9h22.3v24.4H44.6zM0 98.9h22.3v24.4H0zM89.2 98.9h22.3v24.4H89.2zM133.8 98.9h22.3v24.4h-22.3zM178.4 98.9h22.3v24.4h-22.3zM223 98.9h22.3v24.4H223zM267.7 98.9H290v24.4h-22.3zM312.3 98.9h22.3v24.4h-22.3zM356.9 98.9h22.3v24.4h-22.3zM401.5 98.9h22.3v24.4h-22.3zM446.1 98.9h22.3v24.4h-22.3zM490.7 98.9H513v24.4h-22.3zM44.6 216.9h22.3v25.5H44.6zM0 216.9h22.3v25.5H0zM89.2 216.9h22.3v25.5H89.2zM133.8 216.9h22.3v25.5h-22.3zM178.4 216.9h22.3v25.5h-22.3zM223 216.9h22.3v25.5H223zM267.7 216.9H290v25.5h-22.3zM312.3 216.9h22.3v25.5h-22.3zM356.9 216.9h22.3v25.5h-22.3zM401.5 216.9h22.3v25.5h-22.3zM446.1 216.9h22.3v25.5h-22.3zM490.7 216.9H513v25.5h-22.3z"/></g>' },
  jp: { viewBox: "0 0 513 342", body: '<path fill="#FFF" d="M0 0h512v342H0z"/><circle fill="#D80027" cx="256.5" cy="171" r="96"/>' },
  kr: { viewBox: "0 0 513 342", body: '<path fill="#FFF" d="M0 0h513v342H0z"/><g stroke="#000" stroke-width="14.25"><path d="M84.6 107.8 132 36.6m-29.7 83 47.4-71.1m-29.6 83 47.4-71.1M345.4 281.7l47.4-71.1m-29.6 82.9 47.4-71.1m-29.6 83 47.4-71.1M132 305.4l-47.4-71.1m65.2 59.2-47.4-71.1m65.2 59.3-47.4-71.1M392.8 131.5l-47.4-71.1m65.2 59.2-47.4-71.1m65.2 59.3L381 36.6"/></g><g stroke="#FFF" stroke-width="12.5"><path d="m357.3 238.2 59.3 39.5M117.2 263.9 135 252m222.3-148.2L378 90m17.8-11.9 17.8-11.9"/></g><circle fill="#CA163A" cx="256.5" cy="171" r="85.5"/><path fill="#0E4896" d="M185.3 123.6c-13.1 19.6-7.8 46.2 11.9 59.3s46.2 7.8 59.3-11.9 39.6-24.9 59.3-11.9c19.6 13.1 24.9 39.6 11.9 59.3-26.2 39.3-79.3 49.9-118.6 23.7s-49.9-79.3-23.8-118.5z"/>' },
  mx: { viewBox: "0 0 513 342", body: '<path fill="#dc2339" d="M342 0H0v341.3h513V0z"/><path fill="#11865d" d="M0 0h171v342H0z"/><path fill="#FFF" d="M171 0h171v342H171z"/><path fill="#8C9157" d="M195.8 171.2c0 21.6 11.5 41.7 30.3 52.5 5.8 3.4 13.2 1.4 16.6-4.4 3.4-5.8 1.4-13.2-4.4-16.6-11.3-6.5-18.2-18.5-18.2-31.5 0-6.7-5.4-12.1-12.1-12.1-6.7 0-12.2 5.4-12.2 12.1zm93.4 51.1c17.5-11.1 28-30.4 28-51.1 0-6.7-5.4-12.1-12.1-12.1s-12.1 5.4-12.1 12.1c0 12.4-6.3 24-16.8 30.7-5.7 3.5-7.5 10.9-4.1 16.7s10.9 7.5 16.7 4.1c0-.2.2-.3.4-.4z"/><ellipse fill="#C59262" cx="256.5" cy="159.1" rx="24.3" ry="36.4"/>' },
  ru: { viewBox: "0 0 513 342", body: '<path fill="#FFF" d="M0 0h513v114H0z"/><path fill="#0039a6" d="M0 114h513v114H0z"/><path fill="#d52b1e" d="M0 228h513v114H0z"/>' },
  th: { viewBox: "0 85.333 512 341.333", body: '<path fill="#FFF" d="M0 85.334h512V426.66H0z"/><path fill="#0052B4" d="M0 194.056h512v123.882H0z"/><g fill="#D80027"><path d="M0 85.334h512v54.522H0zM0 372.143h512v54.522H0z"/></g>' },
  tr: { viewBox: "0 0 513 342", body: '<path fill="#E30A17" d="M0 0h513v342H0z"/><path fill="#FFF" d="M259.7 118.6c-13.1-9.5-29-14.6-45.3-14.5-40.8 0-73.8 30.8-73.8 68.9s33.1 68.9 73.8 68.9c17.1 0 32.9-5.4 45.3-14.5-30 38.6-85.7 45.6-124.3 15.5s-45.6-85.7-15.5-124.3 85.7-45.6 124.3-15.5c5.8 4.5 11 9.8 15.5 15.5zm39.9 65.8-18.1 21.9 1.2-28.4-26.4-10.4 27.3-7.6 1.8-28.3 15.6 23.7 27.5-7.1-17.5 22 15.3 23.9-26.7-9.7z"/>' },
  ua: { viewBox: "0 85.333 512 341.333", body: '<path fill="#FFDA44" d="M0 85.337h512v341.326H0z"/><path fill="#338AF3" d="M0 85.337h512V256H0z"/>' },
  us: { viewBox: "0 0 513 342", body: '<path fill="#FFF" d="M0 0h513v342H0z"/><g fill="#D80027"><path d="M0 0h513v26.3H0zM0 52.6h513v26.3H0zM0 105.2h513v26.3H0zM0 157.8h513v26.3H0zM0 210.5h513v26.3H0zM0 263.1h513v26.3H0zM0 315.7h513V342H0z"/></g><path fill="#2E52B2" d="M0 0h256.5v184.1H0z"/><g fill="#FFF"><path d="m47.8 138.9-4-12.8-4.4 12.8H26.2l10.7 7.7-4 12.8 10.9-7.9 10.6 7.9-4.1-12.8 10.9-7.7zM104.1 138.9l-4.1-12.8-4.2 12.8H82.6l10.7 7.7-4 12.8 10.7-7.9 10.8 7.9-4-12.8 10.7-7.7zM160.6 138.9l-4.3-12.8-4 12.8h-13.5l11 7.7-4.2 12.8 10.7-7.9 11 7.9-4.2-12.8 10.7-7.7zM216.8 138.9l-4-12.8-4.2 12.8h-13.3l10.8 7.7-4 12.8 10.7-7.9 10.8 7.9-4.3-12.8 11-7.7zM100 75.3l-4.2 12.8H82.6L93.3 96l-4 12.6 10.7-7.8 10.8 7.8-4-12.6 10.7-7.9h-13.4zM43.8 75.3l-4.4 12.8H26.2L36.9 96l-4 12.6 10.9-7.8 10.6 7.8L50.3 96l10.9-7.9H47.8zM156.3 75.3l-4 12.8h-13.5l11 7.9-4.2 12.6 10.7-7.8 11 7.8-4.2-12.6 10.7-7.9h-13.2zM212.8 75.3l-4.2 12.8h-13.3l10.8 7.9-4 12.6 10.7-7.8 10.8 7.8-4.3-12.6 11-7.9h-13.5zM43.8 24.7l-4.4 12.6H26.2l10.7 7.9-4 12.7L43.8 50l10.6 7.9-4.1-12.7 10.9-7.9H47.8zM100 24.7l-4.2 12.6H82.6l10.7 7.9-4 12.7L100 50l10.8 7.9-4-12.7 10.7-7.9h-13.4zM156.3 24.7l-4 12.6h-13.5l11 7.9-4.2 12.7 10.7-7.9 11 7.9-4.2-12.7 10.7-7.9h-13.2zM212.8 24.7l-4.2 12.6h-13.3l10.8 7.9-4 12.7 10.7-7.9 10.8 7.9-4.3-12.7 11-7.9h-13.5z"/></g>' },
  vn: { viewBox: "0 85.333 512 341.333", body: '<path fill="#D80027" d="M196.641 85.337H0v341.326h512V85.337z"/><path fill="#FFDA44" d="m256 157.279 22.663 69.747H352l-59.332 43.106 22.664 69.749L256 296.774l-59.332 43.107 22.664-69.749L160 227.026h73.337z"/>' }
} as const;

export type FlagRegion = keyof typeof FLAGS;
