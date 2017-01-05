const path = require('path')
const { exec } = require('child_process')
const TasksM = require('../')

TasksM.cwd(path.resolve(__dirname, '../'))

TasksM.define('tasksm', {
  patterns: 'src/**/*.ts',
  task() {
    return new Promise((resolve, reject) => {
      exec('node_modules/.bin/tsc --rootDir src --outDir dist', err => {
        if (err) return reject(err)

        resolve()
      })
    })
  }
})

TasksM.useFile(path.resolve(__dirname, '../tasks.json'))
TasksM.run()