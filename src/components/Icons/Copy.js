import React from 'react';
import { Animate } from 'react-move';

const Copy = ({ color, hovered, animationDuration }) =>
  <Animate
    duration={animationDuration}
    data={{
      hoveredOpacity: hovered ? 1 : 0,
      opacity: hovered ? 0 : 1
    }}
  >
    {data =>
      <svg
        width="30"
        height="30"
        viewBox="0 0 30 30"
        xmlns="http://www.w3.org/2000/svg"
        xmlnsXlink="http://www.w3.org/1999/xlink"
      >
        <defs>
          <path
            d="M288 114v-6c0-2.209139-1.790861-4-4-4h-6v-1c0-1.656854 1.343146-3 3-3h8c1.656854 0 3 1.343146 3 3v8c0 1.656854-1.343146 3-3 3h-1zm-13-8h8c1.656854 0 3 1.343146 3 3v8c0 1.656854-1.343146 3-3 3h-8c-1.656854 0-3-1.343146-3-3v-8c0-1.656854 1.343146-3 3-3z"
            id="bxcc"
            fillOpacity={data.hoveredOpacity}
          />
          <path
            d="M275 79c-.552285 0-1 .4477153-1 1v8c0 .5522847.447715 1 1 1h8c.552285 0 1-.4477153 1-1v-8c0-.5522847-.447715-1-1-1h-8zm3-2v-3c0-1.6568542 1.343146-3 3-3h8c1.656854 0 3 1.3431458 3 3v8c0 1.6568542-1.343146 3-3 3h-3v3c0 1.6568542-1.343146 3-3 3h-8c-1.656854 0-3-1.3431458-3-3v-8c0-1.6568542 1.343146-3 3-3h3zm2 0h3c1.656854 0 3 1.3431458 3 3v3h3c.552285 0 1-.4477153 1-1v-8c0-.5522847-.447715-1-1-1h-8c-.552285 0-1 .4477153-1 1v3z"
            id="bxdd"
            fillOpacity={data.opacity}
          />
          <filter x="-42.5%" y="-32.5%" width="185%" height="185%" filterUnits="objectBoundingBox" id="axcc">
            <feOffset dy="2" in="SourceAlpha" result="shadowOffsetOuter1" />
            <feGaussianBlur stdDeviation="2.5" in="shadowOffsetOuter1" result="shadowBlurOuter1" />
            <feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.2 0" in="shadowBlurOuter1" />
          </filter>
        </defs>

        <g transform="translate(-267 -97)" fill="none" fillRule="evenodd">
          <use fill="#000" filter="url(#aaxcc)" xlinkHref="#bxcc" />
          <use fill={color} xlinkHref="#bxcc" />
        </g>
        <g transform="translate(-267 -68)" fillRule="nonzero" fill="none">
          <use fill="#000" filter="url(#axdd)" xlinkHref="#bxdd" />
          <use fill={color} fillRule="evenodd" xlinkHref="#bxdd" />
        </g>
      </svg>}
  </Animate>;

export default Copy;
