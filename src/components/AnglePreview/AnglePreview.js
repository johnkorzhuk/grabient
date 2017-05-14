import Inferno from 'inferno' // eslint-disable-line no-unused-vars
import styled from 'styled-components'

// const Circle = styled.div`
//   border: 2.5px solid #AFAFAF;
//   border-radius: 50%;
//   width: 25px;
//   height: 25px;
//   position: absolute;
//   left: 0;
//   display: flex;
//   align-items: flex-start;
//   justify-content: center;
// `

const Arrow = styled.div`
  position: absolute;
  left: 0;
  display: flex;
  align-items: flex-start;
  justify-content: center;
`

const AnglePreview = ({
  angle,
  styles,
  translateX,
  transitionDuration,
  onClick
}) => {
  return (
    <Arrow
      style={{
        transform: `rotate(${angle}deg)`
      }}
    >
      <svg
        width='26'
        height='26'
        viewBox='0 0 26 26'
        xmlns='http://www.w3.org/2000/svg'
      >
        <g transform='translate(-4.787 -4.787)' fill='none' fill-rule='evenodd'>
          <circle
            stroke='#AFAFAF'
            stroke-width='2.5'
            transform='rotate(-45 18.167 18.167)'
            cx='18.16667'
            cy='18.16667'
            r='11.25'
          />
          <path fill='#AFAFAF' d='M16.95346 6.66667h2.5v12h-2.5z' />
        </g>
      </svg>
    </Arrow>
  )
}

// <svg
//           width='21'
//           height='20'
//           viewBox='0 0 21 20'
//           xmlns='http://www.w3.org/2000/svg'
//           xmlns:xlink='http://www.w3.org/1999/xlink'
//         >
//           <defs>
//             <path id='a' d='M14 5h2.5v15H14z' />
//           </defs>
//           <g transform='rotate(0 10.243 16.97)' fill='none' fill-rule='evenodd'>
//             <use fill='#AFAFAF' xlink:href='#a' />
//             <path
//               stroke='#f1f1f1'
//               stroke-width='2.5'
//               d='M12.75 3.75h5v17.5h-5z'
//             />
//           </g>
//         </svg>

//  <Arrow
//       onClick={onClick}
//       style={{
//         transform: `rotate(${angle + 90}deg) translateX(${translateX}px)`,
//         ...styles
//       }}
//     />

export default AnglePreview
