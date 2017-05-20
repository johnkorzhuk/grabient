import Component from 'inferno-component'
import { connect } from 'inferno-redux'
import styled from 'styled-components'
import {
  SortableContainer,
  SortableElement,
  arrayMove
} from 'react-sortable-hoc'

import { editStop, swapStopsColors } from './../../store/stops/actions'
import { getStopsById, getStopColors } from './../../store/stops/selectors'

import { SwatchItem } from './../../components/index'
import SwatchContainer from './../../components/SwatchItem/Container'

const SortableItem = SortableElement(props => <SwatchItem {...props} />)

const SortableList = SortableContainer(
  ({
    items,
    width,
    height,
    transitionDuration,
    sorting,
    onSortItemClick,
    pickingColor,
    style
  }) => {
    return (
      <SwatchContainer
        stops={items.length}
        duration={transitionDuration}
        style={style}
      >
        {items.map((item, index) => {
          return (
            <SortableItem
              disabled={pickingColor}
              onClick={onSortItemClick}
              key={item.key}
              sorting={sorting}
              index={index}
              color={items[index]}
              style={{
                backgroundColor: items[index],
                left: `${index / items.length * 100}%`
              }}
            />
          )
        })}
      </SwatchContainer>
    )
  }
)

class Swatch extends Component {
  state = {
    colors: null
  }

  componentDidMount () {
    this.setState({
      colors: this.props.colors
    })
  }

  componentWillReceiveProps (nextProps) {
    // update state.colors when a gradient stop is added
    if (this.props.colors.length !== nextProps.colors.length) {
      this.setState({
        colors: nextProps.colors
      })
    }
  }

  _onSortEnd = ({ oldIndex, newIndex }) => {
    const colors = arrayMove(this.state.colors, oldIndex, newIndex)
    const { swapStopsColors, id } = this.props
    this.setState({
      colors
    })

    swapStopsColors(id, colors)
  }

  _handleSortItemClick = () => {
    this.props.editStop(this.props.id)
  }

  render () {
    const { transitionDuration, style } = this.props
    const { pickingColor, colors } = this.state

    return (
      colors &&
      <SortableList
        axis='x'
        lockAxis='x'
        pickingColor={pickingColor}
        transitionDuration={transitionDuration}
        items={this.state.colors}
        onSortItemClick={this._handleSortItemClick}
        onSortStart={this._onSortStart}
        onSortEnd={this._onSortEnd}
        style={style}
        width={25}
        distance={5}
        lockToContainerEdges
      />
    )
  }
}

export default connect(
  (state, { id }) => ({
    editing: state.stops.editing === id,
    stops: getStopsById(state, id),
    colors: getStopColors(id)(state)
  }),
  { editStop, swapStopsColors }
)(Swatch)
