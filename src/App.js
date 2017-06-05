import React, { Component } from 'react'
import { connect } from 'react-redux'
import styled from 'styled-components'

import {
  editStop,
  updateDraggedStopPos,
  updateUpdatingStop,
  updateActiveColorPicker,
  updateActiveStop,
  deleteActiveStop
} from './store/stops/actions'
import { toggleEditing } from './store/gradients/actions'
import { toggleTrashIcon } from './store/icons/actions'
import { getGradients } from './store/gradients/selectors'

import { GradientDisplay } from './components/index'
import { GradientCard } from './containers/index'

const Overlay = styled.div`
  position: absolute;
  z-index: 20;
  top: 0;
  right: 0;
  left: 0;
  bottom: 0;
`

class App extends Component {
  componentDidMount () {
    document.addEventListener('keydown', this._handleCancelEdits)
    document.addEventListener('mousemove', this._handleDocumentMouseMove)
    document.addEventListener('mouseup', this._handleDocumentMouseUp)
  }

  componentWillUnmount () {
    document.removeEventListener('keydown')
    document.removeEventListener('mousemove')
    document.removeEventListener('mouseup')
  }

  _handleCancelEdits = e => {
    const {
      updateActiveColorPicker,
      toggleEditing,
      editStop,
      updateActiveStop,
      deleteActiveStop,
      pickingColorStop
    } = this.props

    if ((e.type === 'keydown' && e.which === 27) || e.type === 'click') {
      this.handleNoop(e)
      updateActiveStop(null)
      if (pickingColorStop) {
        updateActiveColorPicker(null)
      } else {
        toggleEditing(null)
        editStop(null)
      }
    } else if ((e.which === 46 && e.metaKey) || (e.which === 8 && e.metaKey)) {
      deleteActiveStop()
    }
  }

  _handleDocumentMouseMove = e => {
    if (this.props.editingStop) {
      if (this.props.editingStop && this.props.updating) {
        const { x } = e
        this.props.updateDraggedStopPos(x)
      }
    }
  }

  _handleDocumentMouseUp = e => {
    if (this.props.editingStop) {
      if (this.props.editingStop && this.props.updating) {
        this.props.updateUpdatingStop(null)
        this.props.updateDraggedStopPos(null)
      }
    }

    if (this.props.renderDelete) {
      if (this.props.renderDeleteInverted) {
        this.props.deleteActiveStop()
      } else {
        this.props.toggleTrashIcon()
      }
    }
  }

  handleNoop (e) {
    e.stopPropagation()
    e.preventDefault()
  }

  render () {
    const {
      editingAngle,
      editingStop,
      pickingColorStop,
      gradients
    } = this.props
    const editing = editingAngle || editingStop || pickingColorStop
    const gradientKeys = Object.keys(gradients)
    return (
      <GradientDisplay>
        {gradientKeys.map((gradientKey, index) => {
          const gradient = gradients[gradientKey]
          return (
            <GradientCard
              gradient={gradient}
              index={index}
              width='33.33%'
              id={gradientKey}
              key={gradientKey}
            />
          )
        })}
        {editing && <Overlay onClick={this._handleCancelEdits} />}
      </GradientDisplay>
    )
  }
}

export default connect(
  state => ({
    editingAngle: state.gradients.editingAngle.id !== null,
    editingStop: state.stops.editing !== null,
    updating: state.stops.updating.stop !== null,
    pickingColorStop: state.stops.updating.pickingColorStop !== null,
    gradients: getGradients(state),
    renderDelete: state.icons.deleteStop.render,
    renderDeleteInverted: state.icons.deleteStop.inverted
  }),
  {
    toggleEditing,
    editStop,
    updateDraggedStopPos,
    updateUpdatingStop,
    updateActiveColorPicker,
    updateActiveStop,
    deleteActiveStop,
    toggleTrashIcon
  }
)(App)
