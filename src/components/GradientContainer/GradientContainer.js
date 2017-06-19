import React, { PureComponent } from 'react'
import styled from 'styled-components'

import Gradient from './../Gradient/Gradient'
import { AngleWheel } from './../../containers/index'
import { Button } from './../Common/index'
import { Copy } from './../Icons/index'

const GRADIENT_HEIGHT = 300

const Container = styled.div`
  position: relative;
  height: ${GRADIENT_HEIGHT}px;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 10;
`

const NoBlur = styled.div`
  height: 100%;
  width: 100%;
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 15px;
`

const Blurred = styled.div`
  filter: blur(20px);
  height: 100%;
  width: 98%;
  border-radius: 15px;
  margin-top: -${GRADIENT_HEIGHT}px;
`

const CopyCSSButon = Button.extend`
  z-index: 20;
  position: absolute;
  top: 20px;
  right: 20px;
  background-color: rgba(0,0,0,0.15);
  padding: 3px;
  border-radius: 3px;
  transition: background-color 100ms linear;

  &:hover {
    background-color: rgba(0,0,0,0.25);
  }
`

const CopiedText = styled.span`
  color: white;
  padding-right: 3px;
  padding-left: 3px;
`

class GradientContainer extends PureComponent {
  shouldComponentUpdate (nextProps, nextState) {
    return (
      this.props.stopData !== nextProps.stopData ||
      this.props.angle !== nextProps.angle ||
      this.props.hovered !== nextProps.hovered ||
      this.props.editingAngle !== nextProps.editingAngle ||
      this.props.editingStop !== nextProps.editingStop ||
      this.props.editingColor !== nextProps.editingColor ||
      this.props.editingAngleVal !== nextProps.editingAngleVal ||
      this.props.actualAngle !== nextProps.actualAngle ||
      this.props.pickingColorStop !== nextProps.pickingColorStop ||
      this.props.expanded !== nextProps.expanded ||
      this.props.renderCheckIcon !== nextProps.renderCheckIcon
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
      editingColor,
      stopData,
      pickingColorStop,
      onCopyCSS,
      renderCheckIcon
    } = this.props
    const editing = editingAngle || editingStop || editingColor
    const renderCopyCssButton = hovered && !editingAngle

    return (
      <Container>
        {renderCopyCssButton &&
          <CopyCSSButon
            title='Copy CSS'
            onClick={() => onCopyCSS(actualAngle, stopData)}
            onMouseEnter={e => onMouseEnter(e, ['main', 'expandContract'])}
            onMouseLeave={e => onMouseLeave(e, ['main', 'expandContract'])}
          >
            {renderCheckIcon && <CopiedText>copied</CopiedText>}
            <Copy color={'white'} />

          </CopyCSSButon>}

        <NoBlur
          onMouseEnter={e => onMouseEnter(e, ['main'])}
          onMouseLeave={e => onMouseLeave(e, ['main'])}
          style={{
            zIndex: pickingColorStop ? 4 : 9
          }}
        >
          <Gradient
            editingColor={editingColor}
            stopData={stopData}
            angle={actualAngle}
            transitionDuration={gradientAnimationDuration}
          />
        </NoBlur>

        <Blurred>
          <Gradient
            editingColor={editingColor}
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
          onMouseEnter={e => onMouseEnter(e, ['main'])}
          onMouseLeave={e => onMouseLeave(e, ['main'])}
          angle={actualAngle}
          id={id}
          transitionDuration={wheelAnimationDuration}
        />
      </Container>
    )
  }
}

export default GradientContainer
