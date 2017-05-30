import React from 'react'

const Close = ({ color, size, ...props }) => {
  return (
    <svg
      {...props}
      width={size}
      height={size}
      viewBox='0 0 11 11'
      xmlns='http://www.w3.org/2000/svg'
    >
      <path
        d='M6.8995 5.48528l3.53553-3.53553L9.0208.53553 5.4853 4.07107 1.94975.53553.53553 1.94975l3.53554 3.53553L.53553 9.0208l1.41422 1.41423L5.48528 6.8995l3.53553 3.53553 1.41423-1.41422'
        fill={color}
        fillRule='evenodd'
      />
    </svg>
  )
}

export default Close
