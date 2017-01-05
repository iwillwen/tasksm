declare const process: any

/**
 * Tasks Manager
 * 
 * @author iwillwen <willwengunn@gmail.com>
 */

import * as originFS from 'fs'
import globAsync = require('glob')
import * as path from 'path'
import Promise = require('bluebird')
import * as chalk from 'chalk'
import { isArray, isString, isFunction } from 'lodash'
import { createHash } from 'crypto'

const fs : any = Promise.promisifyAll(originFS)
const glob = Promise.promisify(globAsync)

type TaskHandler = {
  (taskName?: string, pattern?: string): Promise<any> | any;
}
type Pattern = string[] | string
type Patterns = Object | Pattern

interface TaskOptions {
  patterns: Patterns,
  task?: TaskHandler,
  taskHandler?: TaskHandler
}

class TasksM {
  private hashFile = 'tasksm.json'
  private tasks = new Map<string, TaskOptions>()
  private hashs = new Map<string, string>()
  private _cwd = process.cwd()

  cwd(cwd: string) {
    this._cwd = cwd
  }
  
  /**
   * Define a building task
   * 
   * @param  {string} taskName
   * @param  {Object|string[]|string} patterns
   * @param  {TaskHandler} taskHandler
   */
  defineTask(taskName: string, patterns: Object | string[] | string, taskHandler: TaskHandler) {
    this.tasks.set(taskName, {
      patterns, taskHandler
    })
  }

  /**
   * Define multiple tasks
   * 
   * @param  {Object} tasks
   */
  define(tasks: Object);

  /**
   * Define a single task
   * 
   * @param  {string} taskName
   * @param  {TaskOptions} options?
   */
  define(taskName: string, options?: TaskOptions);
  define(tasksOrTaskName: any, options?: TaskOptions) {
    // Define a single task
    if (typeof tasksOrTaskName === 'string') {
      const taskName: string = tasksOrTaskName
      const { patterns, task:taskHandler } = options
      
      this.defineTask(taskName, patterns, taskHandler)
    } else {
    // Define multiple tasks
      const tasks: Object = tasksOrTaskName

      for (const name of Object.keys(tasks)) {
        const { patterns, task:taskHandler }: TaskOptions = tasks[name]
        
        this.defineTask(name, patterns, taskHandler)
      }
    }
  }

  /**
   * Load or init the hash file
   * 
   * @returns Promise
   */
  private loadOrInitHashFile() : Promise<any> {
    const filename = this.hashFile

    return new Promise((resolve, reject) => {
      fs.access(filename, originFS.constants.R_OK, err => {
        const exists = !err;

        (new Promise((resolve, reject) => {
          if (exists) {
            return fs.readFileAsync(filename)
              .then(data => resolve(data.toString()))
          } else {
            const data = JSON.stringify({}, null, 2)
            return fs.writeFileAsync(filename, data)
              .then(() => resolve(data))
          }
        }))
          .then((textData: string) => JSON.parse(textData))
          .then(hashData => {
            for (const key of Object.keys(hashData)) {
              this.hashs.set(key, hashData[key])
            }

            resolve(hashData)
          })
          .catch(reject)
      })
    })
  }

  private writeHashFile(hashData = this.hashs) : Promise<any> {
    return fs.writeFileAsync(this.hashFile, plainMaptoJSON(hashData, null, 2))
      .then(() => hashData)
  }

  private flattenTasks(tasks: Map<string, any>) : Map<string, TaskOptions> {
    const _tasks = new Map<string, TaskOptions>()

    tasks.forEach((options: TaskOptions, taskName: string) => {
      const { patterns, taskHandler }: TaskOptions = options

      if (isPattern(patterns)) {
        _tasks.set(taskName + ':default', options)
      } else {
        const subTasksNames = Object.keys(patterns)

        subTasksNames.forEach(subTaskName => _tasks.set(`${taskName}:${subTaskName}`, {
          patterns: patterns[subTaskName],
          taskHandler
        }))
      }
    })

    return _tasks
  }

  private runTask(taskName: string, subTaskName: string, patterns: Pattern, taskHandler: TaskHandler, hash?: string) : Promise<any> {
    let pattern = patterns.toString()
    if (isArray(patterns)) {
      pattern = `{${patterns.join(',')}}`
    }

    return glob(pattern)
      .then((filenames: string[]) => {
        return Promise.reduce(filenames, (total, filename) => {
          return fs.statAsync(filename)
            .then(stat => `${filename}:${stat.ctime.getTime()}`)
            .then(line => {
              total.push(line)

              return total
            })
        }, [])
      })
      .then((n: string[]) => n.join())
      .then(str => md5(str))
      .then(newHash => {
        // No change
        if (hash === newHash) return false

        this.hashs.set(`${taskName}:${subTaskName}`, newHash)

        const rtn = taskHandler(subTaskName, pattern)
        if (isPromise(rtn)) {
          return rtn
        } else {
          return Promise.resolve(newHash)
        }
      })
  }

  run(taskName?: string) {
    this.loadOrInitHashFile()
      .then(hashData => {
        const tasks = this.flattenTasks(this.tasks)
        
        return Promise.reduce(Array.from(tasks.keys()), (total, taskName: string) => {
          const { patterns, taskHandler }: TaskOptions = tasks.get(taskName)

          return new Promise((resolve, reject) => {
            const [ supTaskName, subTaskName ] = taskName.split(':')

            process.stdout.write(chalk.green('[INFO]') + chalk.white(` Running Task ${supTaskName}:${subTaskName}...`))

            this.runTask(supTaskName, subTaskName, patterns as Pattern, taskHandler, this.hashs.get(taskName))
              .then(rtn => {
                if (rtn === false) {
                  console.log(chalk.white('skip'))
                } else {
                  console.log(chalk.white('done'))
                }
                resolve()
              })
              .catch(err => {
                console.log(chalk.red('failed'))
                reject()
              })
          })
        }, [])
      })
      .then(() => {
        process.stdout.write(chalk.green('[INFO]') + chalk.white(` Writing Hash file...`))
        return this.writeHashFile()
      })
      .then(() => {
        console.log(chalk.white('done'))
        console.log(chalk.green('[INFO] Finish'))
      })
  }

  useFile(filename: string) {
    this.hashFile = filename
  }
}

function isPlainType(v: any) {
  const plainTypes = ['string', 'number']
  return plainTypes.indexOf(typeof v) >= 0
}

function plainMaptoJSON(map: Map<string, any>, ...args) {
  const o = {}

  for (const key of Array.from(map.keys())) {
    if (!isPlainType(key)) continue

    o[key] = map.get(key)
  }

  return JSON.stringify.call(JSON, o, ...args)
}

function md5(str: string) : string {
  const md5 = createHash('md5')
  md5.update(str)
  return md5.digest('hex')
}

function isPromise(o: any) {
  return isFunction(o.then) && isFunction(o.catch)
}

function isPattern(o: any) {
  return isArray(o) || isString(o)
}

export default new TasksM()