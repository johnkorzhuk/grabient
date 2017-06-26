import React, { PureComponent } from 'react'
import styled from 'styled-components'

const Container = styled.div`
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
`

const TrashIcon = ({ color }) => {
  return (
    <svg
      width='20'
      height='20'
      viewBox='0 0 20 20'
      xmlns='http://www.w3.org/2000/svg'
    >
      <g fill='none' fillRule='evenodd'>
        <path fill={color} d='M0 4h20v2H0zM7 8h2v8H7V8zm4 0h2v8h-2V8z' />
        <rect
          stroke={color}
          strokeWidth='2'
          x='4'
          y='1'
          width='12'
          height='18'
          rx='3'
        />
      </g>
    </svg>
  )
}

const TrashIconO = ({ color }) => {
  return (
    <svg
      width='20'
      height='20'
      viewBox='0 0 20 20'
      xmlns='http://www.w3.org/2000/svg'
    >
      <path
        d='M17 4h3v2h-3v11c0 1.656854-1.343146 3-3 3H6c-1.656854 0-3-1.343146-3-3V6H0V4h3V3c0-1.656854 1.343146-3 3-3h8c1.656854 0 3 1.343146 3 3v1zM5 4v2h10V4H5zm2 4v8h2V8H7zm4 0v8h2V8h-2z'
        fill={color}
        fillRule='evenodd'
      />
    </svg>
  )
}

class Trash extends PureComponent {
  shouldComponentUpdate (nextProps) {
    return this.props.inverted !== nextProps.inverted
  }

  render () {
    const { color, inverted } = this.props
    return (
      <Container>
        {inverted ? <TrashIconO color={color} /> : <TrashIcon color={color} />}
      </Container>
    )
  }
}

export default Trash
