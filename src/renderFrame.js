var _ = require('lodash')
var flatInt = require('./flatInt')
var Effects = require('./effects')
var getPoints = require('./getPoints')
var mainSource = require('./main-source')

module.exports = function (ctx, main_source, layers, frame_n, unlocked, frameOffset) {
  var effectFrameN = Math.max(0, frame_n + (frameOffset || 0))

  ctx.clearRect(0, 0, main_source.frame_w, main_source.frame_h)

  ctx.globalCompositeOperation = 'screen'
  ctx.imageSmoothingEnabled = true

  mainSource.render(ctx, main_source)

  _.forEach(layers, function (layer) {
    var points = getPoints(layer, effectFrameN)
    if (_.has(Effects, layer.effect_id)) {
      var effect = Effects[layer.effect_id]
      var settings = effect.normalizeSettings(layer.settings)

      if (effect.min_n_points > 0) {
        if ((points.length / 2) < effect.min_n_points) {
          return// not enough points
        }
      }
      if (effect.max_n_points > 0) {
        if ((points.length / 2) > effect.max_n_points) {
          return// too many points
        }
      }

      effect.render(ctx, settings, points, effectFrameN)
    }
  })
