import React from 'react'
import { connect } from 'react-redux'
import styled from 'styled-components'

import { togglePrefixes, toggleFallback } from './../../store/settings/actions'

import { TextMD } from './../../components/Common/Typography'

const Container = styled.section`
  margin: 0 auto 80px;
  max-width: 1100px;
  display: flex;
  justify-content: center;
  align-items: center;
`

const InputContainer = styled.div`
  margin: 0 10px;
`

const Label = TextMD.withComponent('label')

const Input = styled.input`
  position: relative;
  top: 7px;
  left: 5px;
  width: 20px;
  height: 20px;
`

const Settings = ({ prefixes, fallback, togglePrefixes, toggleFallback }) => {
  return (
    <Container>
      <InputContainer>
        <Label htmlFor='prefix'>prefixes</Label>
        <Input
          id='prefix'
          type='checkbox'
          checked={prefixes}
          onChange={togglePrefixes}
        />
      </InputContainer>
      <InputContainer>
        <Label htmlFor='fallback'>fallback bgc</Label>
        <Input
          id='fallback'
          type='checkbox'
          checked={fallback}
          onChange={toggleFallback}
        />
      </InputContainer>
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
)(Settings)
