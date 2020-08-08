var h = require('virtual-dom/h')
var bus = require('./event-bus')
var flatInt = require('./flatInt')
var FrameMath = require('./frame-math')
var RLBrowser = require('./RLBrowser')
var createVideoElement = require('./create-video-element')
var createImageElement = require('./create-image-element')
var toInt = function (n) {
  return parseInt(n, 10) || 0
}

var curr_url = null
var curr_video = null
var curr_image = null
var curr_frameMath = FrameMath(25)

var setCurrentTime = function (time) {
  if (curr_video) {
    curr_video.elm.currentTime = time
  } else {
    bus.emit('seeked', 0, 0)
  }
}

var unMount = function () {
  if (curr_video) {
    curr_video.destroy()
  }
  if (curr_image) {
    curr_image.destroy()
  }
  curr_video = null
  curr_image = null
}

var mount = function (main_source, callback) {
  var tmp
  if (main_source.type === 'image') {
    tmp = createImageElement(main_source.url, {
      onError: function (ev) {
        callback(new Error('Failed to mount image'))
        tmp.destroy()
      },
      onMounted: function (elm) {
        bus.emit('set-main-source-info', {
          frame_w: elm.width,
          frame_h: elm.height,
          n_frames: 1
        })
        curr_image = tmp
        callback()
      }
    })
  } else {
    tmp = createVideoElement(main_source.url, {
      onError: function (ev) {
        RLBrowser.inputFileURLExists(main_source.url, function (err) {
          if (err) {
            err = new Error('File does not exist')
            err.notFound = true
            callback(err)
            return
          }
          callback(new Error('Failed to mount video'))
        })
        tmp.destroy()
      },
      onMounted: function (videoELM) {
        var w = flatInt(videoELM.videoWidth)
        var h = flatInt(videoELM.videoHeight)

        // The dimensions need to be even for exporting to work
        if (w % 2 !== 0) {
          w -= 1
        }
        if (h % 2 !== 0) {
          h -= 1
        }

        let detected_fps
        try {
          detected_fps = videoELM.captureStream().getVideoTracks()[0].getSettings().frameRate
        } catch (err) {
        }
        if (typeof detected_fps !== 'number' || Number.isNaN(detected_fps) || detected_fps <= 0) {
          detected_fps = null
        }

        if (main_source.use_fps) {
          curr_frameMath = FrameMath(main_source.use_fps)
        } else {
          curr_frameMath = FrameMath(25)
        }

        bus.emit('set-main-source-info', {
          frame_w: w,
          frame_h: h,
          detected_fps,

          // TODO use seek ranges instead
          n_frames: Math.max(1, curr_frameMath.secondsToFrame((videoELM.duration) || 0))
        })
        curr_video = tmp
        callback()
      },
      onSeeked: function (time) {
        time = curr_frameMath.getNearestFrameSeconds(time)
        bus.emit('seeked', curr_frameMath.secondsToFrame(time), time)
      }
    })
  }
}

module.exports = {
  clear: function () {
    curr_url = null
    curr_video = null
    curr_image = null
    curr_frameMath = FrameMath(25)
  },
  open: function (main_source) {
    var url = main_source.url
    var type = main_source.type
    var name = main_source.name
    if ((curr_url === url) || (!curr_url && !url)) {
      return// do nothing (no change)
    }
    unMount()// unmount the old one
    curr_url = url
    bus.emit('main-source-start-loading', type)
    mount(main_source, function (err) {
      bus.emit('main-source-done-loading')
      if (err) {
        if (type === 'video') {
          if (err.notFound) {
            bus.emit('push-generic_modal_q', {
              title: 'Failed to load video',
              body: h('div', [
                h('p', ['File not found: ', h('b', name)]),
                h('p', 'Did it move to a new location? Or was it from a camera or device that is no longer attached?')
              ]),
              buttons: [
                {
                  onClick: function () {
                    bus.emit('show_OpenMainSource')
                    bus.emit('pop-generic_modal_q')
                  },
                  text: 'Find it again'
                }
              ]
            })
            return
          }
          bus.emit('push-generic_modal_q', {
            title: 'Failed to load video',
            body: 'Failed to load video "' + name + '"\n',
            buttons: [
              {
                onClick: function () {
                  bus.emit('open-ConvertModal', {
                    input_file: main_source.file_path,
                    input_n_frames: main_source.n_frames
                  })
                  bus.emit('pop-generic_modal_q')
                },
                text: 'Convert to .webm'
              }
            ]
          })
        } else {
          bus.emit('display-error', 'Failed to load ' + type + ' "' + name + "\".\n\nLet's try opening it again.", err)
          bus.emit('show_OpenMainSource')// offer them to re-open it
        }
        return
      }
      setCurrentTime(0)// reset to view the first frame
      setTimeout(function () {
        setCurrentTime(0)// Hack for image not being initially rendered
      }, 100)
    })
  },
  reloadFrameRate: function (main_source) {
    if (main_source.use_fps) {
      curr_frameMath = FrameMath(main_source.use_fps)
    } else {
      curr_frameMath = FrameMath(25)
    }
  },
  incFrameNBy: function (inc) {
    if (curr_video) {
      setCurrentTime(curr_video.elm.currentTime + (inc * curr_frameMath.frame_length))
    } else {
      setCurrentTime(0 + (inc * curr_frameMath.frame_length))
    }
  },
  setFrameN: function (frame_n) {
    setCurrentTime(curr_frameMath.frameToSeconds(frame_n))
  },
  render: function (ctx, main_source) {
    var rotate_deg = toInt(main_source.rotate_deg)
    var w = main_source.frame_w
    var h = main_source.frame_h
    var orig_w = (rotate_deg === 90 || rotate_deg === 270) ? h : w
    var orig_h = (rotate_deg === 90 || rotate_deg === 270) ? w : h
    if (rotate_deg !== 0) {
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.translate(w / 2, h / 2)
      ctx.rotate(rotate_deg * Math.PI / 180)
      ctx.translate(-orig_w / 2, -orig_h / 2)
    }
    if (curr_video) {
      ctx.drawImage(curr_video.elm, 0, 0, orig_w, orig_h)
    }
    if (curr_image) {
      ctx.drawImage(curr_image.elm, 0, 0, orig_w, orig_h)
    }
    if (rotate_deg !== 0) {
      ctx.restore()
    }
  }
}
