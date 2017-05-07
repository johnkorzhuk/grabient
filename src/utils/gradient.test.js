import { generateLinearGradient } from './gradient'

test('generates a linear gradient', () => {
  const gradientSchema = {
    angle: 110,
    gradient: {
      stop1: {
        color: '#e0c3fc',
        stop: 0
      },
      stop2: {
        color: '#8ec5fc',
        stop: 50
      },
      stop3: {
        color: '#43e97b',
        stop: 100
      }
    }
  }
  const expected =
    'linear-gradient(110deg, #e0c3fc 0%, #8ec5fc 50%, #43e97b 100%)'
  const actual = generateLinearGradient(gradientSchema)

  expect(actual).toBe(expected)
})
