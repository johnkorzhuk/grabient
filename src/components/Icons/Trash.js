import React, { PureComponent } from 'react'
import TrashIconO from 'react-icons/lib/fa/trash-o'
import TrashIcon from 'react-icons/lib/fa/trash'
import { Animate } from 'react-move'
import styled from 'styled-components'

const Container = styled.div`
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
`

class Trash extends PureComponent {
  shouldComponentUpdate (nextProps) {
    return this.props.inverted !== nextProps.inverted
  }

  render () {
    const { color, inverted, animationDuration, deleteActiveStop } = this.props

    return (
      <Animate
        duration={animationDuration}
        data={{
          default: inverted ? 1 : 0,
          inverted: inverted ? 0 : 1
        }}
      >
        {data => {
          return (
            <Container>
              <TrashIcon
                size={20}
                color={color}
                style={{
                  position: 'absolute',
                  left: 0,
                  opacity: data.default
                }}
              />
              <TrashIconO
                size={20}
                color={color}
                style={{
                  position: 'absolute',
                  left: 0,
                  opacity: data.inverted
                }}
              />
            </Container>
          )
        }}
      </Animate>
    )
  }
}

// <path
//           d='M10 20C4.47715 20 0 15.52285 0 10S4.47715 0 10 0s10 4.47715 10 10-4.47715 10-10 10zm1-18H9v7h2V2z'
//           fillRule='nonzero'
//           fill={color}
//           fillOpacity={data.activeOpacity}
//         />
//         <path
//           d='M9 2.0619C5.0537 2.554 2 5.92037 2 10c0 4.41828 3.58172 8 8 8s8-3.58172 8-8c0-4.07962-3.0537-7.446-7-7.9381V9H9V2.0619zM10 20C4.47715 20 0 15.52285 0 10S4.47715 0 10 0s10 4.47715 10 10-4.47715 10-10 10z'
//           fillRule='nonzero'
//           fill={color}
//           fillOpacity={data.inactiveOpacity}
//         />

export default Trash
