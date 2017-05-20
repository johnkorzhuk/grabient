export {
  generateLinearGradientFromSchema,
  generateGradientFromData,
  generateColorStopsFromData
}

/**
 * Generates a linear-gradient from a gradientSchema
 * @param  {{angle: number, gradient: {Object}}} gradientSchema - gradient schema
 * @param  {boolean} [prefixed=false] - output gets prefixed
 * @returns {String}
 */
function generateLinearGradientFromSchema (
  gradientSchema,
  inverse = false,
  prefixed = false
) {
  if (gradientSchema) {
    return `${generateColorStops(gradientSchema.gradient)}`
  }
}

function generateGradientFromData (data, prefixed = false, inverse = false) {
  let newData = { ...data }
  delete newData.angle
  let stop = 1

  const gradient = Object.keys(data).reduce((aggr, curr, index) => {
    if (index % 2 === 0) {
      aggr[`stop${stop}`] = {
        color: data[curr]
      }
    } else {
      aggr[`stop${stop}`] = {
        ...aggr[`stop${stop}`],
        stop: data[curr]
      }
      stop++
    }
    return aggr
  }, {})
  return `linear-gradient(${generateAngle(data.angle, inverse)}, ${generateColorStops(gradient)})`
}

function generateColorStopsFromData (data, prefixed = false, inverse = false) {
  let newData = { ...data }
  delete newData.opacity
  const dataKeys = Object.keys(newData)

  // This function relies on the order of stops / colors defined in flattenGradientData in /GradientContainer.js
  return dataKeys
    .map((key, index) => {
      const item = newData[key]

      if (index % 2 === 0) {
        return item
      } else {
        if (index === dataKeys.length - 1) {
          return `${item}%`
        } else {
          return `${item}%,`
        }
      }
    })
    .join(' ')
}

function generateAngle (angle, inverse) {
  if (!inverse) return `${angle}deg`
  else {
    if (angle <= 180) return `${(angle *= 2)}deg`
    else {
      return `${angle % 180 / 2}deg`
    }
  }
}

function generateColorStops (gradient) {
  return Object.keys(gradient)
    .map(
      colorStop => `${gradient[colorStop].color} ${gradient[colorStop].stop}%`
    )
    .join(', ')
}
