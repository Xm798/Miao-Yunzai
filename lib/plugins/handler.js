import lodash from 'lodash'

let events = {}
let Handler = {
  add (cfg) {
    let { ns, fn, property = 50 } = cfg
    let key = cfg.key || cfg.event
    if (!key || !fn) {
      return
    }
    Handler.del(ns, key)
    logger.mark(`[Handler]注册Handler: ${ns} - ${key}`)
    events[key] = events[key] || []
    events[key].push({
      property,
      fn,
      ns,
      key
    })
    events[key] = lodash.orderBy(events[key], ['priority'], ['asc'])
  },
  del (ns, key = '') {
    if (!key) {
      for (let key in events) {
        Handler.del(ns, key)
      }
      return
    }
    if (!events[key]) {
      return
    }
    for (let idx = 0; idx < events[key].length; idx++) {
      let handler = events[key][idx]
      if (handler.ns === ns) {
        events[key].splice(idx, 1)
        events[key] = lodash.orderBy(events[key], ['priority'], ['asc'])
      }
    }
  },
  async callAll (key, e, args) {
    return await Handler.callAll(key, e, args, true)
  },
  async call (key, e, args, allHandler = false) {
    let ret
    for (let obj of events[key]) {
      let fn = obj.fn
      let done = true
      let reject = (msg = '') => {
        if (msg) {
          logger.mark(`[Handler][${key}][Reject] ${msg}`)
        }
        done = false
      }
      ret = fn(e, args, reject)
      if (ret) {
        await ret
      }
      if (done && !allHandler) {
        logger.mark(`[Handler][${key}][Done]`)
        return ret
      }
    }
    return ret
  },
  has (key) {
    return !!events[key]
  }
}
export default Handler
