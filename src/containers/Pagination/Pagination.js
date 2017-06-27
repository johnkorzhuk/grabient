import React, { Component } from 'react'
import { connect } from 'react-redux'
import styled from 'styled-components'
import { Animate } from 'react-move'

import { updatePage } from './../../store/gradients/actions'

import Item from './Item'
import { PaginationArrow } from './../../components/Icons/index'

const Container = styled.div`
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  margin: 25px auto 0;
  max-width: 150px;
  height: 40px;
`

const Uderline = styled.span`
  width: 16px;
  height: 1px;
  position: absolute;
  bottom: 10px;
  border-bottom: 1px solid black;
`

const ArrowContainer = styled.a`
  position: absolute;
  display: inline-block;
  cursor: pointer;
  padding: 10px;
  ${({ position }) => `${position}: -25px`};
`

class Pagination extends Component {
  state = {
    activeItem: this.props.currPage,
    itemWidth: 14,
    hovered: {
      left: false,
      right: false
    }
  }

  componentWillReceiveProps (nextProps) {
    if (this.props.currPage !== nextProps.currPage) {
      this.setState({
        activeItem: nextProps.currPage
      })
    }
  }

  getWidth = width => {
    this.setState({
      itemWidth: width
    })
  }

  handleItemMouseEnter = item => {
    this.setState({
      activeItem: item
    })
  }

  handleContanerMouseLeave = () => {
    this.setState({
      activeItem: this.props.currPage
    })
  }

  handleArrowMouseEnter = position => {
    const newState = {
      ...this.state,
      activeItem: this.props.currPage,
      hovered: {
        ...this.state.hovered,
        [position]: true
      }
    }
    this.setState(newState)
  }

  handleArrowMouseLeave = position => {
    const newState = {
      ...this.state,
      hovered: {
        ...this.state.hovered,
        [position]: false
      }
    }
    this.setState(newState)
  }

  handleArrowClick = (e, change) => {
    e.preventDefault()
    const { total, currPage, updatePage, perPage } = this.props
    const totalItem = Math.ceil(total / perPage)
    const newPage = currPage + change
    if (newPage >= 1 && newPage <= totalItem) {
      updatePage(newPage)
    }
  }

  renderItems (total) {
    let items = []
    for (let i = 1; i <= total; i++) {
      const left = `${(i - 1) / total * 100}%`
      items.push(
        <Item
          onMouseEnter={this.handleItemMouseEnter}
          onClick={this.props.updatePage}
          left={left}
          item={i}
          hovered={this.state.activeItem === i}
          active={this.props.currPage === i}
          key={i}
          getWidth={this.getWidth}
        />
      )
    }
    return items
  }

  render () {
    const { total, perPage } = this.props
    const { activeItem, itemWidth, hovered: { left, right } } = this.state
    const totalItems = Math.ceil(total / perPage)

    return (
      <Animate
        duration={300}
        data={{
          left: (activeItem - 1) / totalItems,
          itemWidth,
          leftArrowColor: left ? '#000000' : '#AFAFAF',
          rightArrowColor: right ? '#000000' : '#AFAFAF'
        }}
      >
        {data => {
          return (
            <Container
              total={totalItems}
              onMouseLeave={this.handleContanerMouseLeave}
            >
              <ArrowContainer
                position='left'
                onMouseEnter={() => this.handleArrowMouseEnter('left')}
                onMouseLeave={() => this.handleArrowMouseLeave('left')}
                onClick={e => this.handleArrowClick(e, -1)}
              >
                <PaginationArrow color={data.leftArrowColor} />
              </ArrowContainer>

              {this.renderItems(totalItems)}

              <ArrowContainer
                position='right'
                onMouseEnter={() => this.handleArrowMouseEnter('right')}
                onMouseLeave={() => this.handleArrowMouseLeave('right')}
                onClick={e => this.handleArrowClick(e, 1)}
              >
                <PaginationArrow right color={data.rightArrowColor} />
              </ArrowContainer>

              <Uderline
                style={{
                  left: `calc(${data.left * 100}% + 10px)`,
                  width: data.itemWidth
                }}
              />

            </Container>
          )
        }}
      </Animate>
    )
  }
}

export default connect(
  state => ({
    currPage: state.gradients.page,
    total: Object.keys(state.gradients.gradientValues).length
  }),
  { updatePage }
)(Pagination)
