import React from 'react'
import CloseIcon from 'react-icons/lib/md/clear'

const Close = ({ color, size, ...props }) => {
  return <CloseIcon color={color} size={size} {...props} />
}

export default Close
