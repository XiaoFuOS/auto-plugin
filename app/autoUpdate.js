import plugin from '../../../lib/plugins/plugin.js'
import { createRequire } from 'module'
import lodash from 'lodash'
import fs from 'node:fs'
import common from '../../../lib/common/common.js'

const require = createRequire(import.meta.url)
const { exec, execSync } = require('child_process')

/**
 * 插件使用说明 必看
 * 插件会在凌晨2-4点之间某一刻自动更新Yunzai和全部插件并自动重启，请谨慎安装！确定需要再安装！
 * 理论上其他目录也可以 但是没测试 不知道 出问题不负责。
 * 已测试功能 更新正常 重启正常
 * 开发者 西北一枝花 QQ1679659 首发群240979646 其他群搬运追责
 **/

export class autoUpdate extends plugin {
  constructor () {
    super({
      name: '自动全部更新',
      dsc: '自动更新全部插件并重启',
      event: 'notice',
      priority: 4643
    })
    this.typeName = 'Yunzai-Bot'
    this.key = 'Yz:autoUpdate'
    this.task = {
      cron: '0 0 2 * * ?',
      name: '自动更新全部插件：凌晨2-4点之间某一刻自动执行',
      fnc: () => this.updataTask()
    }
  }

  async init () {
    let restart = await redis.get(this.key)
    if (restart && process.argv[1].includes('pm2')) { this.reply('重启成功') }
    redis.del(this.key)
  }

  async updataTask () { setTimeout(() => this.updateAll(), Math.floor(Math.random() * 7199999 + 1)) }

  async reply (msg = '', quote = false, data = { at: false }) {
    if (quote || data.at) { logger.error(msg) } else { logger.info(msg) }
    return true
  }

  getPlugin (plugin = '') {
    if (!fs.existsSync(`./plugins/${plugin}/.git`)) return false
    this.typeName = plugin
    return plugin
  }

  async runUpdate (plugin = '') {
    let cm = 'git pull --no-rebase'
    let type = '更新'
    if (plugin) { cm = `git -C ./plugins/${plugin}/ pull --no-rebase` }
    this.oldCommitId = await this.getcommitId(plugin)
    logger.mark(`开始${type}：${this.typeName}`)
    let ret = await this.execSync(cm)
    if (ret.error) {
      logger.mark(`更新失败：${this.typeName}`)
      await this.gitErr(ret.error, ret.stdout)
      return false
    }
    let time = await this.getTime(plugin)
    if (/Already up|已经是最新/g.test(ret.stdout)) { await this.reply(`${this.typeName}已经是最新`) } else {
      this.isUp = await this.reply(`${this.typeName}更新成功`)
      await this.reply(await this.getLog(plugin))
    }
    logger.mark(`最后更新时间：${time}`)
    return true
  }

  async getcommitId (plugin = '') {
    let cm = 'git rev-parse --short HEAD'
    if (plugin) { cm = `git -C ./plugins/${plugin}/ rev-parse --short HEAD` }
    let commitId = execSync(cm, { encoding: 'utf-8' })
    commitId = lodash.trim(commitId)
    return commitId
  }

  async getTime (plugin = '') {
    let cm = 'git log  -1 --oneline --pretty=format:"%cd" --date=format:"%m-%d %H:%M"'
    if (plugin) { cm = `cd ./plugins/${plugin}/ && git log -1 --oneline --pretty=format:"%cd" --date=format:"%m-%d %H:%M"` }
    let time = ''
    try {
      time = execSync(cm, { encoding: 'utf-8' })
      time = lodash.trim(time)
    } catch (error) { time = '获取时间失败' }
    return time
  }

  async gitErr (err, stdout) {
    let msg = '更新失败！'
    let errMsg = err.toString()
    stdout = stdout.toString()
    if (errMsg.includes('Timed out')) {
      await this.reply(msg + `\n连接超时：${errMsg.match(/'(.+?)'/g)[0].replace(/'/g, '')}`)
    } else if (/Failed to connect|unable to access/g.test(errMsg)) {
      await this.reply(msg + `\n连接失败：${errMsg.match(/'(.+?)'/g)[0].replace(/'/g, '')}`)
    } else if (errMsg.includes('be overwritten by merge')) {
      await this.reply(msg + `存在冲突：\n${errMsg}\n` + '请解决冲突后再更新，或者执行#强制更新，放弃本地修改')
    } else if (stdout.includes('CONFLICT')) {
      await this.reply([msg + '存在冲突\n', errMsg, stdout, '\n请解决冲突后再更新，或者执行#强制更新，放弃本地修改'])
    } else {
      await this.reply([errMsg, stdout])
    }
  }

  async updateAll () {
    await this.reply('Auto - PLUGIN即将执行自动更新')
    let dirs = fs.readdirSync('./plugins/')
    await this.runUpdate()
    for (let plu of dirs) {
      plu = this.getPlugin(plu)
      if (plu === false) continue
      await common.sleep(1500)
      await this.runUpdate(plu)
    }
    if (this.isUp) {
      await this.reply('即将执行重启，以应用更新')
      setTimeout(() => this.restart(), 2000)
    }
  }

  async getLog (plugin = '') {
    let cm = 'git log  -20 --oneline --pretty=format:"%h||[%cd]  %s" --date=format:"%m-%d %H:%M"'
    if (plugin) { cm = `cd ./plugins/${plugin}/ && ${cm}` }
    let logAll
    try { logAll = execSync(cm, { encoding: 'utf-8' }) } catch (error) { logger.error(error.toString()) }
    if (!logAll) return false
    logAll = logAll.split('\n')
    let log = []
    for (let str of logAll) {
      str = str.split('||')
      if (str[0] === this.oldCommitId) break
      if (str[1].includes('Merge branch')) continue
      log.push(str[1])
    }
    let line = log.length
    log = log.join('\n\n')
    if (log.length <= 0) return ''
    logger.info(`${plugin || 'Yunzai-Bot'}更新日志，共${line}条`)
    logger.info(log)
    return log
  }

  async restart () {
    await this.reply('开始执行重启，请稍等...')
    let npm = await this.checkPnpm()
    try {
      await redis.set(this.key, 'autoUpdate', { EX: 120 })
      let cm = `${npm} start`
      if (process.argv[1].includes('pm2')) { cm = `${npm} run restart` } else { await this.reply('当前为前台运行，重启将转为后台...') }
      exec(cm, { windowsHide: true }, (error, stdout, stderr) => {
        if (error) {
          redis.del(this.key)
          logger.error(`重启失败\n${error.stack}`)
        } else if (stdout) {
          logger.mark('重启成功，运行已由前台转为后台')
          logger.mark(`查看日志请用命令：${npm} run log`)
          logger.mark(`停止后台运行命令：${npm} stop`)
          process.exit()
        }
      })
    } catch (error) {
      redis.del(this.key)
      let e = error.stack ?? error
      this.reply(`操作失败！\n${e}`, true)
    }
  }

  async checkPnpm () {
    let ret = await this.execSync('pnpm -v')
    return ret.stdout ? 'pnpm' : 'npm'
  }

  async execSync (cmd) { return new Promise((resolve, reject) => { exec(cmd, { windowsHide: true }, (error, stdout, stderr) => { resolve({ error, stdout, stderr }) }) }) }
}