import React from 'react';
import { connect } from 'react-redux';

import { togglePrefixes, toggleFallback } from './../../store/settings/actions';
import grabients from './../../assets/grabients.sketch';

import { TextSM, TextXS } from './../../components/Common/Typography';
import { Checkbox, UnfoldLogo } from './../../components/Common/index';
import { ActionGroupItem, ActionGroupItemContainer } from './../../components/index';
import { Sketch } from './../../components/Icons/index';
import { GradientDisplayContainer } from './../../components/Sections/GradientDisplay';

const Container = GradientDisplayContainer.extend`
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

const CreditText = TextXS.extend`@media (max-width: 550px) {margin-bottom: 2px;}`;

const ActionsGroup = ({ prefixes, fallback, togglePrefixes, toggleFallback }) => {
  return (
    <Container>
      <ActionGroupItemContainer>
        <ActionGroupItem
          href={grabients}
          type="button"
          download="grabients.sketch"
          style={{
            cursor: 'pointer'
          }}
          ml={15}
          itemStyle={{
            marginTop: 2
          }}
        >
          <TextSM>Download Sketch</TextSM>
          <Sketch />
        </ActionGroupItem>

        <ActionGroupItem
          checked={prefixes}
          style={{
            cursor: 'pointer'
          }}
          onClick={togglePrefixes}
          itemStyle={{
            marginTop: 2
          }}
        >
          <TextSM htmlFor="prefix">Prefixes</TextSM>
          <Checkbox checked={prefixes} />
        </ActionGroupItem>

        <ActionGroupItem
          checked={fallback}
          style={{
            cursor: 'pointer'
          }}
          onClick={toggleFallback}
          itemStyle={{
            marginTop: 2
          }}
        >
          <TextSM>Fallback BGC</TextSM>
          <Checkbox checked={fallback} />
        </ActionGroupItem>
      </ActionGroupItemContainer>

      <ActionGroupItemContainer orderSM={-1}>
        <ActionGroupItem
          href="https://www.unfold.co"
          style={{
            cursor: 'pointer'
          }}
          ml={12}
        >
          <CreditText>
            Crafted with{' '}
            <span role="img" aria-label="Heart">
              ♥
            </span>
            <span
              style={{
                paddingLeft: 3
              }}
            >
              by
            </span>
          </CreditText>
          <UnfoldLogo />
        </ActionGroupItem>
      </ActionGroupItemContainer>
    </Container>
  );
};

export default connect(
  state => ({
    prefixes: state.settings.prefixes,
    fallback: state.settings.fallback
  }),
  {
    togglePrefixes,
    toggleFallback
  }
)(ActionsGroup);
