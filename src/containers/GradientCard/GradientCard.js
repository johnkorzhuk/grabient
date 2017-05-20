import Component from 'inferno-component'
import styled from 'styled-components'
import { connect } from 'inferno-redux'

import { toggleEditing } from './../../store/gradients/actions'
import { getGradientById } from './../../store/gradients/selectors'

import { AnglePreview, GradientContainer } from './../../components/index'
import { AddColor } from './../../components/Icons/index'
import { Slider, Swatch } from './../index'

// units = ms
const GRADIENT_ANIMATION_DURATION = 500
const ANGLE_WHEEL_ANIMATION_DURATION = 300
const ANGLE_PREVIEW_ANIMATION_DURATION = 200
const SWATCH_ANIMATION_DURATION = 300

const Container = styled.div`
  width: 33.33%;
  height: 35vw;
  max-height: 420px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 30px 3% 10px;
  position: relative;
`

const AngleContainer = styled.div`
  margin-right: auto;
  position: relative;
  cursor: pointer;
`

const AngleText = styled.span`
  font-size: 1.6rem;
  color: #AFAFAF;
  padding-left: 10px;
  position: absolute;
  top: 2px;
`

const SwatchContainer = styled.div`
  position: relative;
  width: 100%;
  height: 25px;
  align-self: flex-end;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  z-index: 10;
  bottom: 15px;
`

const AddColorContainer = styled.div`
  height: 25px;
  margin-left: 15px;
  cursor: pointer;
`

class GradientCard extends Component {
  state = {
    hovered: {
      arrowPrev: false,
      addColor: false,
      main: false
    },
    wasEditing: false
  }

  componentWillReceiveProps (nextProps) {
    const { editing } = this.props
    if (editing !== nextProps.editing) {
      this.setState({ wasEditing: !nextProps.editing })
    }
  }

  _handleMouseEnter = (e, el) => {
    if (!this.state.wasEditing) {
      const newState = { ...this.state }
      newState.hovered[el] = true
      this.setState(newState)
    }
  }

  _handleMouseLeave = (e, el) => {
    const newState = { ...this.state }
    newState.hovered[el] = false
    newState.wasEditing = false

    this.setState(newState)
  }

  render () {
    const { hovered: { arrowPrev, addColor, main } } = this.state
    const { gradient, id, toggleEditing, angle, editing, index } = this.props

    return (
      <Container
        style={{
          order: index
        }}
      >
        <GradientContainer
          onMouseEnter={this._handleMouseEnter}
          onMouseLeave={this._handleMouseLeave}
          gradientAnimationDuration={GRADIENT_ANIMATION_DURATION}
          wheelAnimationDuration={ANGLE_WHEEL_ANIMATION_DURATION}
          id={id}
          gradient={gradient}
          hovered={main}
          editing={editing}
        />

        <SwatchContainer>
          <AngleContainer
            onClick={() => toggleEditing(id)}
            onMouseEnter={e => this._handleMouseEnter(e, 'arrowPrev')}
            onMouseLeave={e => this._handleMouseLeave(e, 'arrowPrev')}
          >
            <AnglePreview
              angle={angle}
              animationDuration={ANGLE_PREVIEW_ANIMATION_DURATION}
              hovered={arrowPrev}
            />
            <AngleText>{angle}°</AngleText>
          </AngleContainer>

          <Swatch id={id} transitionDuration={SWATCH_ANIMATION_DURATION} />

          <AddColorContainer
            onMouseEnter={e => this._handleMouseEnter(e, 'addColor')}
            onMouseLeave={e => this._handleMouseLeave(e, 'addColor')}
          >
            <AddColor
              anmationDuration={SWATCH_ANIMATION_DURATION}
              hovered={addColor}
              color='#AFAFAF'
            />
          </AddColorContainer>
        </SwatchContainer>
        <Slider id={id} />
      </Container>
    )
  }
}

const mapStateToProps = (state, { id }) => {
  const gradient = getGradientById(id)(state)
  return {
    gradient,
    // eslint-disable-next-line eqeqeq
    editing: id == state.gradients.editingAngle.id,
    // eslint-disable-next-line eqeqeq
    angle: id == state.gradients.editingAngle.id
      ? state.gradients.editingAngle.angle === null
          ? gradient.angle
          : state.gradients.editingAngle.angle
      : gradient.angle
  }
}

export default connect(mapStateToProps, { toggleEditing })(GradientCard)
