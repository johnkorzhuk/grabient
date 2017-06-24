import React from 'react'
import { connect } from 'react-redux'
import styled from 'styled-components'

import { togglePrefixes, toggleFallback } from './../../store/settings/actions'

import { TextMD } from './../../components/Common/Typography'
import { Checkbox } from './../../components/Common/index'
import { ActionGroupItem } from './../../components/index'
import { Sketch } from './../../components/Icons/index'

const Container = styled.section`
  margin: 0 auto 80px;
  max-width: 1100px;
  display: flex;
  justify-content: center;
  align-items: center;
`

const Label = TextMD.withComponent('label')

const Input = styled.input`
`

const ActionsGroup = ({
  prefixes,
  fallback,
  togglePrefixes,
  toggleFallback
}) => {
  return (
    <Container>
      <ActionGroupItem
        style={{
          cursor: 'pointer'
        }}
        ml={15}
        itemStyle={{
          marginTop: 4
        }}
      >
        <TextMD>Download Sketch</TextMD>
        <Sketch />
      </ActionGroupItem>

      <ActionGroupItem id='prefix'>
        <Label htmlFor='prefix'>Prefixes</Label>
        <Input
          id='prefix'
          type='checkbox'
          checked={prefixes}
          onChange={togglePrefixes}
        />
      </ActionGroupItem>

      <ActionGroupItem id='fallback'>
        <Label htmlFor='fallback'>Fallback BGC</Label>
        <Input
          id='fallback'
          type='checkbox'
          checked={fallback}
          onChange={toggleFallback}
        />
      </ActionGroupItem>

    </Container>
  )
}

export default connect(
  state => ({
    prefixes: state.settings.prefixes,
    fallback: state.settings.fallback
  }),
  {
    togglePrefixes,
    toggleFallback
  }
)(ActionsGroup)
