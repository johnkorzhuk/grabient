import React, { Component, cloneElement } from 'react';
import styled from 'styled-components';
import { Animate } from 'react-move';

import { TextSM } from './../Common/Typography';

const Container = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  margin-right: 30px;
  cursor: pointer;

  &:last-child {
    margin-right: 0;
  }

  @media (max-width: 550px) {
    flex-direction: column;
    justify-content: center;
  }
`;

const Pretext = TextSM.extend`
  color: #afafaf;
  order: -1;

  @media (max-width: 550px) {
    margin-bottom: 5px;
  }
`;

const LinkContainer = Container.withComponent('a');

const ItemContainer = styled.div`
  margin-left: ${({ ml }) => `${ml}px`};

  @media (max-width: 550px) {
    margin-left: 0;
  }
`;

class ActionGroupItem extends Component {
  state = {
    hovered: false
  };

  handleMouseEnter = () => {
    this.setState({
      hovered: true
    });
  };

  handleMouseLeave = () => {
    this.setState({
      hovered: false
    });
  };

  render() {
    const { children, ml = 10, itemStyle, style, id, href, pretext, checked, ...props } = this.props;
    const { hovered } = this.state;

    return (
      <Animate
        data={{
          color: hovered || checked ? '#2A2A2A' : '#AFAFAF'
        }}
      >
        {data => {
          if (href) {
            return (
              <LinkContainer
                {...props}
                href={href}
                target="_blank"
                onMouseEnter={this.handleMouseEnter}
                onMouseLeave={this.handleMouseLeave}
                style={style}
              >
                {pretext
                  ? <Pretext>
                      {pretext}
                    </Pretext>
                  : null}
                {cloneElement(children[0], {
                  style: {
                    color: data.color
                  }
                })}
                <ItemContainer ml={ml} style={itemStyle}>
                  {cloneElement(children[1], {
                    color: data.color,
                    id
                  })}
                </ItemContainer>
              </LinkContainer>
            );
          }
          return (
            <Container
              {...props}
              onMouseEnter={this.handleMouseEnter}
              onMouseLeave={this.handleMouseLeave}
              style={style}
            >
              {cloneElement(children[0], {
                style: {
                  color: data.color
                }
              })}
              <ItemContainer ml={ml} style={itemStyle}>
                {cloneElement(children[1], {
                  color: data.color,
                  id
                })}
              </ItemContainer>
            </Container>
          );
        }}
      </Animate>
    );
  }
}

export default ActionGroupItem;
