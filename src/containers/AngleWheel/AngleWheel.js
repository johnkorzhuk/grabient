import Component from 'inferno-component'
import styled from 'styled-components'
import { Animate } from 'react-move'
import { connect } from 'inferno-redux'
import Wheelpng from './../../wheel.png'

import { Arrow, Close } from './../../components/Icons/index'

import {
  updateGradientAngle,
  toggleEditing
} from './../../store/gradients/actions'
import { getGradientEditingState } from './../../store/gradients/selectors'

const AreaContainer = styled.div`
  position: absolute;
  width: calc(100% - 68px);
  top: 45px;
  bottom: 87px;
  left: 34px;
  background-color: #000;
  opacity: 0.5;
  border-radius: 15px;
  background-image: url(${Wheelpng});
  background-size: 65%;
  background-repeat: no-repeat;
  background-position: center;
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
`

const AngleRef = styled.div`
  position: absolute;
  height: 2px;
  width: 2px;
`

const TextContainer = styled.div`
  position: absolute;
  display: flex;
  align-items: center;
`

const TextValue = styled.input`
  color: white;
  font-size: 1.8rem;
  cursor: default;
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
`

const ArrowContainer = styled.div`
  position: absolute;
  cursor: pointer;
`

class AngleWheel extends Component {
  state = {
    cursorUpdatingAngle: this.props.editing,
    updatingText: false,
    angle: this.props.angle
  }

  componentWillReceiveProps (nextProps) {
    if (nextProps.editing) {
      setTimeout(() => this.input.focus(), 250)
    }
  }

  shouldComponentUpdate (nextProps, nextState) {
    if (this.state.angle !== nextState.angle) return true
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
    this.updateAngle()
    toggleEditing(id)
    this.setState(() => ({
      cursorUpdatingAngle: false,
      updatingText: false
    }))
  }

  _handleMouseMove = e => {
    const { cursorUpdatingAngle, updatingText } = this.state
    if (cursorUpdatingAngle && !updatingText) {
      const angle = this.checkCommonAngles(this.getAngle(e.offsetX, e.offsetY))
      this.setState({
        angle
      })
    }
  }

  _handleKeyEnter = e => {
    if (e.which === 13) {
      const { angle } = this.props
      this.updateAngle()
      this.toggleEditing()
      this.setState(prevState => ({
        cursorUpdatingAngle: false,
        angle: prevState.angle || angle
      }))
    }
  }

  _handleInputChange = e => {
    let angle = parseInt(e.target.value, 10)
    if (!isNaN(angle)) {
      if (angle > 359) angle -= 360
      if (angle < 0) angle += 360
      this._handleInputChange.lastValid = angle
      this.setState({
        angle
      })
    } else if (e.target.value === '') {
      this.setState({
        angle: ''
      })
    } else {
      this.setState({
        angle: this._handleInputChange.lastValid || this.props.angle
      })
    }
  }

  _handleInputClick = () => {
    this.setState(() => ({ cursorUpdatingAngle: false }))
  }

  _handleClick = e => {
    const { cursorUpdatingAngle } = this.state

    if (cursorUpdatingAngle) {
      this.updateAngle()
      this.toggleEditing()
      this.setState(() => ({
        cursorUpdatingAngle: false,
        updatingText: false
      }))
    } else {
      const angle = this.getAngle(e.offsetX, e.offsetY)

      this.setState({
        angle
      })
    }
  }

  _handleArrowClick = () => {
    this.setState(() => ({ cursorUpdatingAngle: true }))
  }

  _handleClose = () => {
    this.setState({
      angle: this.props.angle
    })
    this.toggleEditing()
  }

  toggleEditing () {
    const { id, toggleEditing } = this.props
    toggleEditing(id)
  }

  updateAngle () {
    const { angle } = this.state
    const { updateGradientAngle, id } = this.props
    const newAngle = isNaN(angle) ? this.props.angle : angle
    updateGradientAngle(id, newAngle)
  }

  checkCommonAngles (angle) {
    if (angle <= 10) return 0
    else if (angle >= 35 && angle <= 55) return 45
    else if (angle >= 80 && angle <= 100) return 90
    else if (angle >= 125 && angle <= 145) return 135
    else if (angle >= 170 && angle <= 190) return 180
    else if (angle >= 215 && angle <= 235) return 225
    else if (angle >= 260 && angle <= 280) return 270
    else if (angle >= 305 && angle <= 325) return 315
    else if (angle >= 350) return 0
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
    const { cursorUpdatingAngle, angle } = this.state
    const { transitionDuration, editing } = this.props
    return (
      <Animate
        data={{
          opacity: editing ? 0.5 : 0
        }}
        duration={transitionDuration}
      >
        {data => {
          return (
            <AreaContainer
              style={{
                opacity: data.opacity,
                zIndex: editing ? 15 : 1
              }}
            >
              <Container
                onClick={this._handleClick}
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
                  zIndex: cursorUpdatingAngle ? 15 : 17
                }}
              />

              <TextContainer>
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
                    width: this.getWidth(angle),
                    zIndex: cursorUpdatingAngle ? 15 : 17
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
  ({ gradients: { editing } }, { id }) => ({ editing: id == editing }),
  {
    updateGradientAngle,
    toggleEditing
  }
)(AngleWheel)
