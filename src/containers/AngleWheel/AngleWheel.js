import Component from 'inferno-component'
import styled from 'styled-components'
import { Animate } from 'react-move'
import { connect } from 'inferno-redux'
import Wheelpng from './../../wheel.png'

import { Arrow, Close } from './../../components/Icons/index'

import {
  updateGradientAngle,
  toggleEditing,
  updateEditingAngle
} from './../../store/gradients/actions'

const AreaContainer = styled.div`
  position: absolute;
  width: 99%;
  height: 89%;
  top: 2px;
  display: flex;
  justify-content: center;
  align-items: center;
`

const Container = styled.div`
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  width: 100%;
  background-image: url(${Wheelpng});
  background-size: 65%;
  background-repeat: no-repeat;
  background-position: center;
`

const Background = styled.div`
  height: 100%;
  border-radius: 15px;
  position: absolute;
  width: 100%;
  background-color: #000;
`

const AngleRef = styled.div`
  position: absolute;
  height: 2px;
  width: 2px;
`

const TextContainer = styled.div`
  position: absolute;
  display: flex;
  cursor: text;
  align-items: center;
  justify-content: center;
  height: 85px;
  width: 85px;
`

const TextValue = styled.input`
  color: white;
  font-size: 1.8rem;
  text-align: center;
  border: none;
  background: none;
  display: block;

  &::-webkit-inner-spin-button,
  ::-webkit-outer-spin-button {
    -webkit-appearance: none; 
    margin: 0; 
  }

  &:focus {
    outline: none;
  }
`

const Deg = styled.span`
  color: white;
  font-size: 1.8rem;
  display: block;
  cursor: default;
`

const ArrowContainer = styled.div`
  position: absolute;
  cursor: pointer;
`

const origState = {
  cursorUpdatingAngle: true,
  updatingText: false,
  cursorUpdatingAngleAccurately: false
}

class AngleWheel extends Component {
  state = origState

  componentWillReceiveProps (nextProps) {
    if (nextProps.editing) {
      setTimeout(() => this.input.focus(), this.props.transitionDuration + 50)
    } else if (!nextProps.editing) {
      this.setState(origState)
    }
  }

  shouldComponentUpdate (nextProps, nextState) {
    if (this.props.angle !== nextProps.angle) return true
    if (this.state.cursorUpdatingAngle !== nextState.cursorUpdatingAngle) {
      return true
    }
    if (this.props.editing !== nextProps.editing) {
      return true
    }
    return false
  }

  _handleMouseLeave = () => {
    const { toggleEditing, id } = this.props
    this.updateActualAngle()
    toggleEditing(id)
    this.setState(() => ({
      cursorUpdatingAngle: false,
      updatingText: false
    }))
  }

  _handleMouseMove = e => {
    const {
      cursorUpdatingAngle,
      updatingText,
      cursorUpdatingAngleAccurately
    } = this.state
    const { updateEditingAngle } = this.props
    if (cursorUpdatingAngle && !updatingText) {
      let angle = this.getAngle(e.offsetX, e.offsetY)
      if (!cursorUpdatingAngleAccurately) angle = this.checkCommonAngles(angle)
      if (angle === 360) angle = 0
      updateEditingAngle(angle)
    }
  }

  _handleKeyEnter = e => {
    if (e.which === 13) {
      this.updateActualAngle()
      this.toggleEditing()
      this.setState(prevState => ({
        cursorUpdatingAngle: false
      }))
    }
  }

  _handleInputChange = e => {
    let angle = parseInt(e.target.value, 10)
    if (!isNaN(angle)) {
      if (angle > 359) {
        angle = 0
        this.input.value = angle
      }
      if (angle < 0) angle = 360 - Math.abs(angle % 360)
      this._handleInputChange.lastValid = angle
      this.updateEditingAngle(angle)
    } else {
      const value = this._handleInputChange.lastValid || this.props.origAngle
      this.input.value = ''
      this.updateEditingAngle(value)
    }
  }

  _handleInputClick = () => {
    this.setState(() => ({ cursorUpdatingAngle: false }))
  }

  _handleClick = e => {
    const { cursorUpdatingAngle } = this.state

    if (cursorUpdatingAngle) {
      this.updateActualAngle()
      this.toggleEditing()
      this.setState(origState)
    } else {
      this.updateEditingAngle(this.getAngle(e.offsetX, e.offsetY))
    }
  }

  _handleArrowClick = () => {
    this.setState(() => ({ cursorUpdatingAngle: true }))
  }

  _handleClose = () => {
    this.toggleEditing()
  }

  _handleMouseDown = () => {
    const { cursorUpdatingAngle } = this.state
    if (cursorUpdatingAngle) {
      this.setState({
        cursorUpdatingAngleAccurately: true
      })
    }
  }

  toggleEditing () {
    const { id, toggleEditing } = this.props
    toggleEditing(id)
  }

  updateEditingAngle (angle) {
    const { updateEditingAngle } = this.props
    updateEditingAngle(angle)
  }

  updateActualAngle () {
    const { updateGradientAngle, id, angle, origAngle } = this.props
    const newAngle = isNaN(angle) ? origAngle : angle
    updateGradientAngle(id, newAngle)
  }

  checkCommonAngles (angle) {
    if (angle <= 10 || angle >= 350) return 0
    else if (angle >= 35 && angle <= 55) return 45
    else if (angle >= 80 && angle <= 100) return 90
    else if (angle >= 125 && angle <= 145) return 135
    else if (angle >= 170 && angle <= 190) return 180
    else if (angle >= 215 && angle <= 235) return 225
    else if (angle >= 260 && angle <= 280) return 270
    else if (angle >= 305 && angle <= 325) return 315
    return angle
  }

  getAngle (offsetX, offsetY) {
    if (!this.getAngle.boxCenter) {
      this.getAngle.boxCenter = this.getBoxCenter()
    }
    let angle =
      Math.atan2(
        offsetX - this.getAngle.boxCenter[0],
        -(offsetY - this.getAngle.boxCenter[1])
      ) *
      (180 / Math.PI)
    if (angle < 0) angle += 360
    return Math.round(angle)
  }

  getBoxCenter () {
    return [
      this.box.offsetLeft + this.box.offsetWidth / 2,
      this.box.offsetTop + this.box.offsetHeight / 2
    ]
  }

  getWidth (angle) {
    const length = angle.toString().length

    if (length === 2) return 25
    else if (length === 3) return 35
    else return 15
  }

  render () {
    const { cursorUpdatingAngle } = this.state
    const { transitionDuration, editing, angle } = this.props
    return (
      <Animate
        data={{
          opacity: editing ? 0.1 : 0
        }}
        duration={transitionDuration}
      >
        {data => {
          return (
            <AreaContainer
              style={{
                zIndex: editing ? 15 : 1
              }}
            >
              <Background style={{ opacity: data.opacity }} />
              <Container
                onClick={this._handleClick}
                onMouseDown={this._handleMouseDown}
                onMouseMove={this._handleMouseMove}
                style={{
                  zIndex: cursorUpdatingAngle ? 17 : 15
                }}
              >
                <AngleRef
                  innerRef={node => {
                    this.box = node
                  }}
                />

              </Container>

              <Close
                onClick={this._handleClose}
                color='white'
                size={25}
                style={{
                  position: 'absolute',
                  top: 15,
                  right: 15,
                  cursor: 'pointer',
                  zIndex: 17
                }}
              />

              <TextContainer
                style={{
                  zIndex: 17
                }}
              >
                <TextValue
                  autoFocus
                  innerRef={node => {
                    this.input = node
                  }}
                  onFocus={e => e.target.select()}
                  onClick={this._handleInputClick}
                  onKeyDown={this._handleKeyEnter}
                  type='number'
                  value={angle}
                  onChange={this._handleInputChange}
                  style={{
                    width: this.getWidth(angle)
                  }}
                />
                <Deg>°</Deg>
              </TextContainer>

              <ArrowContainer
                onClick={this._handleArrowClick}
                style={{
                  transform: `rotate(${angle}deg) translateY(-118px)`,
                  zIndex: cursorUpdatingAngle ? 14 : 16
                }}
              >
                <Arrow />
              </ArrowContainer>
            </AreaContainer>
          )
        }}
      </Animate>
    )
  }
}

export default connect(
  ({ gradients: { editingAngle } }, { id, angle }) => ({
    editing: id == editingAngle.id,
    angle: !isNaN(editingAngle.angle)
      ? editingAngle.angle === null ? angle : editingAngle.angle
      : angle,
    origAngle: angle
  }),
  {
    updateGradientAngle,
    toggleEditing,
    updateEditingAngle
  }
)(AngleWheel)
