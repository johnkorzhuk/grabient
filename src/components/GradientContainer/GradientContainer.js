import React, { PureComponent } from 'react'
import styled from 'styled-components'

import Gradient from './../Gradient/Gradient'
import { AngleWheel, ExpandContract } from './../../containers/index'

const Container = styled.div`
  position: relative;
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 10;
`

const NoBlur = styled.div`
  height: 90%;
  width: 100%;
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 15px;
`

const Blurred = styled.div`
  filter: blur(20px);
  height: 92%;
  width: 98%;
  position: absolute;
  border-radius: 15px;
`

class GradientContainer extends PureComponent {
  shouldComponentUpdate (nextProps, nextState) {
    return (
      this.props.stopData !== nextProps.stopData ||
      this.props.angle !== nextProps.angle ||
      this.props.hovered !== nextProps.hovered ||
      this.props.editingAngle !== nextProps.editingAngle ||
      this.props.editingStop !== nextProps.editingStop ||
      this.props.editingAngleVal !== nextProps.editingAngleVal ||
      this.props.actualAngle !== nextProps.actualAngle ||
      this.props.pickingColorStop !== nextProps.pickingColorStop ||
      this.props.expanded !== nextProps.expanded
    )
  }

  render () {
    const {
      gradientAnimationDuration,
      wheelAnimationDuration,
      id,
      actualAngle,
      hovered,
      onMouseEnter,
      onMouseLeave,
      editingAngle,
      editingStop,
      stopData,
      pickingColorStop
    } = this.props
    const editing = editingAngle || editingStop

    return (
      <Container>
        {hovered &&
          <ExpandContract
            id={id}
            onMouseEnter={e => onMouseEnter(e, ['main', 'expandContract'])}
            onMouseLeave={e => onMouseLeave(e, ['main', 'expandContract'])}
          />}

        <NoBlur
          onMouseEnter={e => onMouseEnter(e, ['main'])}
          onMouseLeave={e => onMouseLeave(e, ['main'])}
          style={{
            zIndex: pickingColorStop ? 4 : 9
          }}
        >
          <Gradient
            stopData={stopData}
            angle={actualAngle}
            transitionDuration={gradientAnimationDuration}
          />
        </NoBlur>

        <Blurred>
          <Gradient
            stopData={stopData}
            hasOpacity
            editing={editing}
            hovered={hovered}
            opacity={0.8}
            angle={actualAngle}
            transitionDuration={gradientAnimationDuration}
          />
        </Blurred>

        <AngleWheel
          angle={actualAngle}
          id={id}
          transitionDuration={wheelAnimationDuration}
        />
      </Container>
    )
  }
}

export default GradientContainer
