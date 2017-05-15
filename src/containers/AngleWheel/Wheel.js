import Inferno from 'inferno' // eslint-disable-line no-unused-vars

const Wheel = ({ angle, scale, color }) => {
  return (
    <svg
      width='210'
      height='210'
      viewBox='0 0 210 210'
      xmlns='http://www.w3.org/2000/svg'
      xmlns:xlink='http://www.w3.org/1999/xlink'
    >
      <defs>
        <circle id='aa' cx='105' cy='105' r='105' />
        <mask id='b' x='0' y='0' width='210' height='210' fill='#fff'>
          <use xlink:href='#aa' />
        </mask>
      </defs>
      <use
        mask='url(#b)'
        xlink:href='#aa'
        stroke='#FFF'
        stroke-width='40'
        fill='none'
        fill-rule='evenodd'
        stroke-dasharray='1.200000047683716,3'
      />
    </svg>
  )
}

export default Wheel
