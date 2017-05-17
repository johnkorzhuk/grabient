import Inferno from 'inferno' // eslint-disable-line no-unused-vars

const AnglePrev = ({ angle, scale, color }) => {
  return (
    <svg
      width='20'
      height='20'
      style={{
        transform: `rotate(${angle}deg) scale(${scale})`
      }}
      viewBox='0 0 20 20'
      xmlns='http://www.w3.org/2000/svg'
    >
      <path
        d='M7 .4578v2.12372C4.06817 3.7683 2 6.64262 2 10c0 4.41828 3.58172 8 8 8s8-3.58172 8-8c0-3.35738-2.06817-6.2317-5-7.41848V.4578C17.0571 1.73207 20 5.52236 20 10c0 5.52285-4.47715 10-10 10S0 15.52285 0 10C0 5.52236 2.9429 1.73207 7 .4578zM9 0h2v9H9V0z'
        fill-rule='nonzero'
        fill={color}
      />
    </svg>
  )
}

export default AnglePrev
