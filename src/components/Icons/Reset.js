import React from 'react';
import { Animate } from 'react-move';

const Reset = ({ color, hovered, animationDuration }) => {
  return (
    <Animate
      duration={animationDuration}
      data={{
        hoveredOpacity: hovered ? 1 : 0,
        opacity: hovered ? 0 : 1
      }}
    >
      {data => {
        return (
          <svg
            width="30"
            height="30"
            viewBox="0 0 30 30"
            xmlns="http://www.w3.org/2000/svg"
            xmlnsXlink="http://www.w3.org/1999/xlink"
          >
            <defs>
              <path
                d="M252 120c-5.522847 0-10-4.477153-10-10s4.477153-10 10-10 10 4.477153 10 10-4.477153 10-10 10zm0-15c-1.125606 0-2.164339.371945-3 .999634V103.5l-2 1.5v5h4.5l1.5-2h-3.236107c.549321-.613749 1.347607-1 2.236107-1 1.656854 0 3 1.343146 3 3s-1.343146 3-3 3c-.8885 0-1.686786-.386251-2.236107-1h-2.347849c.771556 1.765905 2.533637 3 4.583956 3 2.761424 0 5-2.238576 5-5s-2.238576-5-5-5z"
                id="b11x"
                fillOpacity={data.hoveredOpacity}
              />
              <filter x="-42.5%" y="-32.5%" width="185%" height="185%" filterUnits="objectBoundingBox" id="a11x">
                <feOffset dy="2" in="SourceAlpha" result="shadowOffsetOuter1" />
                <feGaussianBlur stdDeviation="2.5" in="shadowOffsetOuter1" result="shadowBlurOuter1" />
                <feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.2 0" in="shadowBlurOuter1" />
              </filter>

              <path
                d="M5.4160437 12C6.1876003 13.7659048 7.94968095 15 10 15c2.7614237 0 5-2.2385763 5-5 0-2.76142375-2.2385763-5-5-5-2.76142375 0-5 2.23857625-5 5h2c0-1.65685425 1.34314575-3 3-3 1.6568542 0 3 1.34314575 3 3 0 1.6568542-1.3431458 3-3 3-.8884998 0-1.68678595-.3862506-2.2361065-1H5.4160437z"
                id="b22x"
                fillOpacity={data.opacity}
              />
              <circle id="d22x" cx="10" cy="10" r="10" fillOpacity={data.opacity} />
              <filter x="-42.5%" y="-32.5%" width="185%" height="185%" filterUnits="objectBoundingBox" id="c22x">
                <feOffset dy="2" in="SourceAlpha" result="shadowOffsetOuter1" />
                <feMorphology radius="2" in="SourceAlpha" result="shadowInner" />
                <feOffset dy="2" in="shadowInner" result="shadowInner" />
                <feComposite in="shadowOffsetOuter1" in2="shadowInner" operator="out" result="shadowOffsetOuter1" />
                <feGaussianBlur stdDeviation="3" in="shadowOffsetOuter1" result="shadowBlurOuter1" />
                <feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.3 0" in="shadowBlurOuter1" />
              </filter>
            </defs>
            <g transform="translate(-237 -97)" fill="none" fillRule="evenodd">
              <use fill="#000" filter="url(#a11x)" xlinkHref="#b11x" />
              <use fill={color} xlinkHref="#b11x" />
            </g>

            <g fill="none" fillRule="evenodd">
              <g transform="translate(5 3)">
                <use fill="#000" filter="url(#c22x)" xlinkHref="#d22x" />
                <circle stroke={color} strokeWidth="2" cx="10" cy="10" r="9" />
              </g>
              <g fillRule="nonzero" transform="translate(5 3)">
                <use fill={color} fillRule="evenodd" xlinkHref="#b22x" />
              </g>
              <path
                fill={color}
                fillRule="nonzero"
                d="M11.81818182 11.84615385V7L10 8.61538462V14h3.63636364L15 11.84615385"
                fillOpacity={data.opacity}
              />
            </g>
          </svg>
        );
      }}
    </Animate>
  );
  if (hovered) {
    return (
      <svg
        width="30"
        height="30"
        viewBox="0 0 30 30"
        xmlns="http://www.w3.org/2000/svg"
        xmlnsXlink="http://www.w3.org/1999/xlink"
      >
        <defs>
          <path
            d="M252 120c-5.522847 0-10-4.477153-10-10s4.477153-10 10-10 10 4.477153 10 10-4.477153 10-10 10zm0-15c-1.125606 0-2.164339.371945-3 .999634V103.5l-2 1.5v5h4.5l1.5-2h-3.236107c.549321-.613749 1.347607-1 2.236107-1 1.656854 0 3 1.343146 3 3s-1.343146 3-3 3c-.8885 0-1.686786-.386251-2.236107-1h-2.347849c.771556 1.765905 2.533637 3 4.583956 3 2.761424 0 5-2.238576 5-5s-2.238576-5-5-5z"
            id="b"
          />
          <filter x="-42.5%" y="-32.5%" width="185%" height="185%" filterUnits="objectBoundingBox" id="a">
            <feOffset dy="2" in="SourceAlpha" result="shadowOffsetOuter1" />
            <feGaussianBlur stdDeviation="2.5" in="shadowOffsetOuter1" result="shadowBlurOuter1" />
            <feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.2 0" in="shadowBlurOuter1" />
          </filter>
        </defs>
        <g transform="translate(-237 -97)" fill="none" fillRule="evenodd">
          <use fill="#000" filter="url(#a)" xlinkHref="#b" />
          <use fill={color} xlinkHref="#b" />
        </g>
      </svg>
    );
  } else {
    return (
      <svg
        width="30"
        height="30"
        viewBox="0 0 30 30"
        xmlns="http://www.w3.org/2000/svg"
        xmlnsXlink="http://www.w3.org/1999/xlink"
      >
        <defs>
          <path
            d="M5.4160437 12C6.1876003 13.7659048 7.94968095 15 10 15c2.7614237 0 5-2.2385763 5-5 0-2.76142375-2.2385763-5-5-5-2.76142375 0-5 2.23857625-5 5h2c0-1.65685425 1.34314575-3 3-3 1.6568542 0 3 1.34314575 3 3 0 1.6568542-1.3431458 3-3 3-.8884998 0-1.68678595-.3862506-2.2361065-1H5.4160437z"
            id="b"
          />
          <circle id="d" cx="10" cy="10" r="10" />
          <filter x="-42.5%" y="-32.5%" width="185%" height="185%" filterUnits="objectBoundingBox" id="c">
            <feOffset dy="2" in="SourceAlpha" result="shadowOffsetOuter1" />
            <feMorphology radius="2" in="SourceAlpha" result="shadowInner" />
            <feOffset dy="2" in="shadowInner" result="shadowInner" />
            <feComposite in="shadowOffsetOuter1" in2="shadowInner" operator="out" result="shadowOffsetOuter1" />
            <feGaussianBlur stdDeviation="3" in="shadowOffsetOuter1" result="shadowBlurOuter1" />
            <feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.3 0" in="shadowBlurOuter1" />
          </filter>
        </defs>
        <g fill="none" fillRule="evenodd">
          <g transform="translate(5 3)">
            <use fill="#000" filter="url(#c)" xlinkHref="#d" />
            <circle stroke={color} strokeWidth="2" cx="10" cy="10" r="9" />
          </g>
          <g fillRule="nonzero" transform="translate(5 3)">
            <use fill={color} fillRule="evenodd" xlinkHref="#b" />
          </g>
          <path
            fill={color}
            fillRule="nonzero"
            d="M11.81818182 11.84615385V7L10 8.61538462V14h3.63636364L15 11.84615385"
          />
        </g>
      </svg>
    );
  }
};

export default Reset;
