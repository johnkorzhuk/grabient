import React from 'react'

const Reset = ({ color, hovered }) => {
  return (
    <svg
      width='30'
      height='30'
      viewBox='0 0 30 30'
      xmlns='http://www.w3.org/2000/svg'
      xmlnsXlink='http://www.w3.org/1999/xlink'
    >
      <defs>
        <path
          d='M5.4160437 12C6.1876003 13.7659048 7.94968095 15 10 15c2.7614237 0 5-2.2385763 5-5 0-2.76142375-2.2385763-5-5-5-2.76142375 0-5 2.23857625-5 5h2c0-1.65685425 1.34314575-3 3-3 1.6568542 0 3 1.34314575 3 3 0 1.6568542-1.3431458 3-3 3-.8884998 0-1.68678595-.3862506-2.2361065-1H5.4160437z'
          id='b'
        />
        <circle id='d' cx='10' cy='10' r='10' />
        <filter
          x='-42.5%'
          y='-32.5%'
          width='185%'
          height='185%'
          filterUnits='objectBoundingBox'
          id='c'
        >
          <feOffset dy='2' in='SourceAlpha' result='shadowOffsetOuter1' />
          <feMorphology radius='2' in='SourceAlpha' result='shadowInner' />
          <feOffset dy='2' in='shadowInner' result='shadowInner' />
          <feComposite
            in='shadowOffsetOuter1'
            in2='shadowInner'
            operator='out'
            result='shadowOffsetOuter1'
          />
          <feGaussianBlur
            stdDeviation='3'
            in='shadowOffsetOuter1'
            result='shadowBlurOuter1'
          />
          <feColorMatrix
            values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.3 0'
            in='shadowBlurOuter1'
          />
        </filter>
      </defs>
      <g fill='none' fillRule='evenodd'>

        <g transform='translate(5 3)'>
          <use fill='#000' filter='url(#c)' xlinkHref='#d' />
          <circle stroke={color} strokeWidth='2' cx='10' cy='10' r='9' />
        </g>
        <g fillRule='nonzero' transform='translate(5 3)'>
          <use fill={color} fillRule='evenodd' xlinkHref='#b' />
        </g>
        <path
          fill={color}
          fillRule='nonzero'
          d='M11.81818182 11.84615385V7L10 8.61538462V14h3.63636364L15 11.84615385'
        />
      </g>
    </svg>
  )
}

export default Reset

// <svg
//   width='30'
//   height='30'
//   viewBox='0 0 30 30'
//   xmlns='http://www.w3.org/2000/svg'
//   xmlnsXlink='http://www.w3.org/1999/xlink'
// >
//   <defs>
//     <circle id='b1z' cx='10' cy='10' r='10' />
//     <filter
//       x='-42.5%'
//       y='-32.5%'
//       width='185%'
//       height='185%'
//       filterUnits='objectBoundingBox'
//       id='a1z'
//     >

//       <feOffset dy='2' in='SourceAlpha' result='shadowOffsetOuter1' />
//       <feMorphology radius='2' in='SourceAlpha' result='shadowInner' />
//       <feOffset dy='2' in='shadowInner' result='shadowInner' />
//       <feComposite
//         in='shadowOffsetOuter1'
//         in2='shadowInner'
//         operator='out'
//         result='shadowOffsetOuter1'
//       />
//       <feGaussianBlur
//         stdDeviation='2.5'
//         in='shadowOffsetOuter1'
//         result='shadowBlurOuter1'
//       />
//       <feColorMatrix
//         values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.2 0'
//         in='shadowBlurOuter1'
//       />

//     </filter>
//   </defs>
//   <g fill='none' fillRule='evenodd'>
//     <path
//       d='M10.4160437 15C11.1876003 16.7659048 12.94968095 18 15 18c2.7614237 0 5-2.2385763 5-5 0-2.76142375-2.2385763-5-5-5-2.76142375 0-5 2.23857625-5 5h2c0-1.65685425 1.34314575-3 3-3 1.6568542 0 3 1.34314575 3 3 0 1.6568542-1.3431458 3-3 3-.8884998 0-1.68678595-.3862506-2.2361065-1h-2.3478498z'
//       fill='#AFAFAF'
//       fillRule='nonzero'
//     />
//     <g transform='translate(5 3)'>
//       <use fill='#000' filter='url(#a1z)' xlink:href='#b1z' />
//       <circle stroke='#AFAFAF' strokeWidth='2' cx='10' cy='10' r='9' />
//     </g>
//     <path
//       fill='#AFAFAF'
//       fillRule='nonzero'
//       d='M11.81818182 11.84615385V7L10 8.61538462V14h3.63636364L15 11.84615385'
//     />
//   </g>
// </svg>
