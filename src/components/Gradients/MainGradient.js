import Inferno from 'inferno' // eslint-disable-line no-unused-vars
import styled from 'styled-components'
import { Animate } from 'react-move'

const Svg = styled.svg`
  width: 100%;
  height: 100%;
  z-index: 10;
  border-radius: 15px;
`

// <svg
//           width='300'
//           height='300'
//           viewBox='0 0 300 300'
//           xmlns='http://www.w3.org/2000/svg'
//           xmlns:xlink='http://www.w3.org/1999/xlink'
//         >
//           <defs>
//             <rect id='b' width='300' height='300' rx='10' />
//             <circle id='a' cx='105' cy='105' r='105' />
//             <mask id='c' x='0' y='0' width='210' height='210' fill='#fff'>
//               <use xlink:href='#a' />
//             </mask>
//           </defs>
// <g fill='none' fill-rule='evenodd'>
//   <use fill-opacity='.5' fill='#000' xlink:href='#b' />
//   <g style='mix-blend-mode:overlay' transform='translate(45 45)'>
//     <use
//       stroke='#FFF'
//       mask='url(#c)'
//       stroke-width='40'
//       stroke-dasharray='1.200000047683716,3'
//       xlink:href='#a'
//     />
//     <text
//       font-family='.SFNSDisplay, .SF NS Display'
//       font-size='30'
//       fill='#FFF'
//     >
//       <tspan x='71.23828' y='117'>º165</tspan>
//     </text>
//   </g>
// </g>
//         </svg>

const MainGradient = ({
  lines,
  stops,
  duration,
  hovered,
  id,
  angle,
  ...props
}) => {
  const { x1, y1, x2, y2 } = lines
  const gradientId = `linearGradient-${id}`
  const group1Id = `group1-${id}`
  const group2Id = `group2-${id}`
  const rectId = `rectId-${id}`
  return (
    <Animate
      data={{
        opacity: hovered ? 0.5 : 0
      }}
      duration={duration}
    >
      {data => {
        return (
          <Svg {...props}>
            <defs>
              <linearGradient x1={x1} y1={y1} x2={x2} y2={y2} id={gradientId}>
                {stops}
              </linearGradient>

              <rect id='a' width='100%' height='100%' rx='15' />
            </defs>

            <g
              id={group1Id}
              stroke='none'
              stroke-width='1'
              fill='none'
              fill-rule='evenodd'
            >
              <g id={group2Id} fill={`url(#${gradientId})`}>
                <rect id={rectId} width='100%' height='100%' rx='15' />
              </g>

              <use
                fill-opacity={data.opacity}
                fill='#000'
                xlink:href='#a'
                fill-rule='evenodd'
              />
            </g>
          </Svg>
        )
      }}
    </Animate>
  )
}

export default MainGradient
