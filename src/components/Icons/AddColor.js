import Inferno from 'inferno' // eslint-disable-line no-unused-vars

const AddColor = ({ width, height = width }) => {
  return (
    <svg
      width='25'
      height='25'
      viewBox='0 0 25 25'
      xmlns='http://www.w3.org/2000/svg'
    >
      <g fill='none' fill-rule='evenodd'>
        <circle
          stroke='#AFAFAF'
          stroke-width='2.5'
          cx='12.5'
          cy='12.5'
          r='11'
        />
        <path
          d='M13.75 11.25V7.5h-2.5v3.75H7.5v2.5h3.75v3.75h2.5v-3.75h3.75v-2.5h-3.75z'
          fill='#AFAFAF'
        />
      </g>
    </svg>
  )
}

export default AddColor
