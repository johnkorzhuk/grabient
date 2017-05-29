import React, { Component } from 'react'
import { connect } from 'react-redux'
import styled from 'styled-components'

import {
  editStop,
  updateDraggedStopPos,
  updateUpdatingStop,
  updateActiveColorPicker
} from './store/stops/actions'
import { toggleEditing } from './store/gradients/actions'

import { GradientDisplay } from './components/index'
import { GradientList } from './containers/index'

const Overlay = styled.div`
  position: absolute;
  z-index: 5;
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

  _handleNoop = e => {
    e.stopPropagation()
    e.preventDefault()
  }

  _handleCancelEdits = e => {
    if ((e.type === 'keydown' && e.which === 27) || e.type === 'click') {
      this._handleNoop(e)
      if (this.props.pickingColorStop) {
        this.props.updateActiveColorPicker(null)
      } else {
        this.props.toggleEditing(null)
        this.props.editStop(null)
      }
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
  }

  render () {
    const { editingAngle, editingStop } = this.props
    const editing = editingAngle || editingStop
    return (
      <GradientDisplay>
        <GradientList />
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
    pickingColorStop: state.stops.updating.pickingColorStop !== null
  }),
  {
    toggleEditing,
    editStop,
    updateDraggedStopPos,
    updateUpdatingStop,
    updateActiveColorPicker
  }
)(App)
