import plugin from "../../../lib/plugins/plugin.js"
import common from "../../../lib/common/common.js"
import fetch from "node-fetch"
import MysInfo from "../model/mys/mysInfo.js"

export class exchange extends plugin {
  constructor() {
    super({
      name: "兑换码",
      dsc: "前瞻直播兑换码",
      event: "message",
      priority: 1000,
      rule: [
        {
          reg: /^(#|\*)?(原神|星铁|崩铁|崩三|崩坏三|崩坏3|绝区零)?(直播|前瞻)?兑换码$/,
          fnc: "getCode",
        },
        {
          reg: "^#(原神|星铁|绝区零)?(兑换码使用|cdk-u).+",
          fnc: "useCode",
        },
      ],
    })
  }

  async getCode() {
    let reg = this.e.msg.match(
      /^(#|\*)?(原神|星铁|崩铁|崩三|崩坏三|崩坏3|绝区零)?(直播|前瞻)?兑换码$/,
    )
    this.uid = "75276539"
    this.gid = "2"
    if (reg[1] == "*" || ["星铁", "崩铁"].includes(reg[2])) {
      this.uid = "80823548"
      this.gid = "6"
    }
    if (["崩三", "崩坏三", "崩坏3"].includes(reg[2])) {
      this.uid = "73565430"
      this.gid = "1"
    }
    if (reg[2] == "绝区零") {
      this.uid = "152039148"
      this.gid = "8"
    }
    this.now = parseInt(Date.now() / 1000)
    let actid = await this.getActId()
    let isBackupAct = false
    if (!actid) {
      actid = await this.getBackupActId()
      isBackupAct = true
    }
    if (!actid) {
      logger.info("[兑换码] 未获取到actId")
      return true
    }

    this.actId = actid

    /** index info */
    let index = await this.getData("index")
    if (!index || !index.data) {
      return true
    }

    if (index.data === null) {
      return await this.reply(`错误：\n${index.message}`)
    }

    let index_data = index.data.live
    let title = index_data["title"]
    this.code_ver = index_data["code_ver"]
    if (index_data.remain > 0) {
      return await this.reply(`暂无${title}直播兑换码`, true)
    }

    let code = await this.getData("code")
    let time
    if (isBackupAct) {
      time = await this.getTimeStamp()
    } else {
      time = this.deadline
    }
    if (!code || !code.data?.code_list) {
      logger.info("[兑换码] 未获取到兑换码")
      return true
    }
    let codes = []

    for (let val of code.data.code_list) {
      if (val.code) {
        codes.push([
          val.code,
          segment.button([{ text: "兑换", callback: `#兑换码使用${val.code}` }]),
        ])
      }
    }

    let msg = [`兑换码过期时间: \n${time}`, ...codes]
    msg = await common.makeForwardMsg(this.e, msg, `${title}-直播兑换码`)
    await this.reply(msg)
  }

  async getData(type) {
    let url = {
      index: `https://api-takumi.mihoyo.com/event/miyolive/index`,
      code: `https://api-takumi-static.mihoyo.com/event/miyolive/refreshCode?version=${this.code_ver}&time=${this.now}`,
      actId: `https://bbs-api.mihoyo.com/painter/api/user_instant/list?offset=0&size=20&uid=${this.uid}`,
      nav: `https://bbs-api.miyoushe.com/apihub/api/home/new?gids=${this.gid}&parts=1%2C3%2C4`,
    }

    let response
    try {
      response = await fetch(url[type], {
        method: "get",
        headers: {
          "x-rpc-act_id": this.actId,
        },
      })
    } catch (error) {
      logger.error(error.toString())
      return false
    }

    if (!response.ok) {
      logger.error(`[兑换码接口错误][${type}] ${response.status} ${response.statusText}`)
      return false
    }
    const res = await response.json()
    return res
  }

  // 获取 "act_id"
  async getActId() {
    let ret = await this.getData("actId")
    if (ret.error || ret.retcode !== 0) {
      return ""
    }

    for (const p of ret.data.list) {
      // Not every posts have post.post
      let post = p?.post?.post
      if (!post) {
        continue
      }
      let date = new Date(post.created_at * 1000)
      if (this.uid == "80823548") {
        date.setDate(date.getDate() + 1)
        this.deadline = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} 23:59:59`
      } else if (this.uid == "73565430") {
        date.setDate(date.getDate() + 5)
        this.deadline = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} 23:59:59`
      } else if (this.uid == "152039148") {
        date.setDate(date.getDate() + 1)
        this.deadline = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} 23:59:59`
      } else {
        date.setDate(date.getDate() + 5)
        this.deadline = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} 12:00:00`
      }
      let structured_content = post.structured_content
      let result = structured_content.match(
        /{\"link\":\"https:\/\/webstatic.mihoyo.com\/bbs\/event\/live\/index.html\?act_id=(.*?)\\/,
      )
      if (result) {
        return result[1]
      }
    }
  }

  // 兑换码使用
  async useCode() {
    const cdkCode = this.e.msg.replace(/#(原神|星铁|绝区零)?(兑换码使用|cdk-u)/, "").trim()
    const res = await MysInfo.get(this.e, "useCdk", { cdk: cdkCode })
    if (res.retcode == 0) {
      this.e.reply(`${res.data.msg}`)
    }
  }

  async getBackupActId() {
    const res = await this.getData("nav")
    if (res.retcode !== 0) return null
    const navMatch = res.data?.navigator?.find(
      item => item.name.match(/前瞻|特别节目/) && item.app_path.includes("act_id="),
    )

    if (navMatch) {
      const actId = navMatch.app_path.match(/act_id=([a-zA-Z0-9]+)/)[1]
      return actId
    }
  }

  async getTimeStamp() {
    let code = await this.getData("code")
    let timestamp = code.data.code_list[0].to_get_time
    const date = new Date(timestamp * 1000)
    const s = this.gid === "2" ? 3 : this.gid === "1" || this.gid === "6" ? 1 : 2
    date.setDate(date.getDate() + s)
    const y = date.getFullYear()
    const m = (date.getMonth() + 1).toString().padStart(2, "0")
    const d = date.getDate().toString().padStart(2, "0")
    const t = this.gid === "2" ? "12:00:00" : "23:59:59"
    const time = `${y}-${m}-${d} ${t}`
    return time
  }
}
