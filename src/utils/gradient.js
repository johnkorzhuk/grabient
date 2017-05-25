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
  let gradient = { ...gradientSchema }
  delete gradient.angle
  delete gradient.id

  if (gradientSchema) {
    return `${generateAngle(gradientSchema.angle)}, ${generateColorStops(gradient.gradient)}`
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
  let gradientStops = []

  dataKeys.forEach((stop, index) => {
    gradientStops.push(newData[stop])
    gradientStops.push(index === dataKeys.length - 1 ? `${stop}%` : `${stop}%,`)
  })

  return gradientStops.join(' ')
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
    .map(colorStop => {
      if (gradient[colorStop].color) {
        return `${gradient[colorStop].color} ${gradient[colorStop].stop}%`
      } else {
        return `${gradient[colorStop]} ${colorStop}%`
      }
    })
    .join(', ')
}
