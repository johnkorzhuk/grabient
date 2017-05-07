export { generateLinearGradient }

/**
 * Generates a linear-gradient
 * @param  {{angle: number, gradient: {Object}}} gradientSchema - gradient schema
 * @param  {boolean} [prefixed=false] - output gets prefixed
 * @returns {String}
 */
function generateLinearGradient (gradientSchema, prefixed = false) {
  if (gradientSchema) {
    return `linear-gradient(${gradientSchema.angle}deg, ${generateColorStops(gradientSchema.gradient)})`
  }
}

function generateColorStops (gradient) {
  return Object.keys(gradient)
    .map(
      colorStop => `${gradient[colorStop].color} ${gradient[colorStop].stop}%`
    )
    .join(', ')
}
