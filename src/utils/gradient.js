export { generateLinearGradient }

/**
 * Generates a linear-gradient
 * @param  {{angle: number, gradient: {Object}}} gradientSchema - gradient schema
 * @param  {boolean} [prefixed=false] - output gets prefixed
 * @returns {String}
 */
function generateLinearGradient (
  gradientSchema,
  inverse = false,
  prefixed = false
) {
  if (gradientSchema) {
    return `linear-gradient(${generateAngle(gradientSchema.angle, inverse)}, ${generateColorStops(gradientSchema.gradient)})`
  }
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
