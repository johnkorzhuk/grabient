import React from 'react';
import styled from 'styled-components';

import john from './../../assets/john.png';
import eddie from './../../assets/eddie.png';

import { TextXS, TextSM } from './../Common/Typography';
import { UnfoldLogo } from './../Common/index';
import { ActionGroupItem, ActionGroupItemContainer } from './../index';

const PhotoText = TextSM.extend`margin-left: 7px;`;

const Container = styled.footer`
  margin: 0 auto 30px;
  padding: 0 20px;
  max-width: 1100px;
  display: flex;
  justify-content: space-between;

  align-items: center;
  flex-wrap: wrap;

  @media (max-width: 620px) {
    flex-direction: column;
  }
`;

const John = () =>
  <ActionGroupItem
    pretext="Development:"
    href="https://twitter.com/johnkorzhuk"
    itemStyle={{
      order: -1
    }}
    style={{
      cursor: 'pointer'
    }}
  >
    <PhotoText>@johnkorzhuk</PhotoText>
    <img src={john} alt="john" />
  </ActionGroupItem>;

const Eddie = () =>
  <ActionGroupItem
    pretext="Design:"
    href="https://twitter.com/lobanovskiy"
    itemStyle={{
      order: -1
    }}
    style={{
      cursor: 'pointer'
    }}
  >
    <PhotoText>@lobanovskiy</PhotoText>
    <img src={eddie} alt="eddie" />
  </ActionGroupItem>;

const Footer = () =>
  <Container>
    <ActionGroupItemContainer>
      <John />
      <Eddie />
    </ActionGroupItemContainer>

    <ActionGroupItemContainer>
      <ActionGroupItem href="https://www.unfold.co">
        <TextXS>
          ©{new Date().getFullYear()} Grabient by
        </TextXS>
        <UnfoldLogo />
      </ActionGroupItem>
    </ActionGroupItemContainer>
  </Container>;

export default Footer;
