/**
 * 打包三个包
 */

const { exec } = require('child_process')
const weappLint = ['npm run build:wx', 'npm run build:my', 'npm run build:tt']
console.log(`正在同时执行打包命令, ${weappLint.join(' ')}`)
weappLint.map((run) => {
  funExec(run)
})
function funExec(runStr) {
  exec(runStr, (error, stdout, stderr) => {
    if (error) {
        console.error(`${error}`)
        reject(false)
        return
    }
    console.log(`stdout: ${stdout}`)
    if(stderr) {
      console.log(`${stderr}`)
    }
  })
}