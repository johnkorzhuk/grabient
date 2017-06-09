import React, { Component } from 'react'
import styled from 'styled-components'
import { Transition } from 'react-move'

import { GradientCard } from './../../containers/index'

const Container = styled.ul`
  display: flex;
  justify-content: center;
  flex-wrap: wrap;

  @media (min-width: 680px) {
    justify-content: flex-start;
  }
`

class GradientList extends Component {
  state = {
    loaded: false
  }

  componentDidMount () {
    this.setState({
      loaded: true
    })
  }

  shouldComponentUpdate (nextProps, nextState) {
    return (
      this.props.gradients !== nextProps.gradients ||
      this.state.loaded !== nextState.loaded
    )
  }

  render () {
    const { gradients } = this.props
    const { loaded } = this.state

    return (
      <Transition
        data={gradients}
        getKey={item => item.id}
        update={item => ({
          translate: 0,
          opacity: 1
        })}
        enter={item => ({
          translate: 250,
          opacity: 0
        })}
        stagger={loaded ? 100 : 0}
        duration={500}
      >
        {data => (
          <Container>
            {data.map(({ data, key, state }, index) => {
              return (
                <GradientCard
                  gradient={data}
                  index={index}
                  width='33.33%'
                  id={key}
                  key={key}
                  style={{
                    opacity: state.opacity,
                    transform: `translateY(${state.translate}px)`
                  }}
                />
              )
            })}
          </Container>
        )}
      </Transition>
    )
  }
}

export default GradientList
