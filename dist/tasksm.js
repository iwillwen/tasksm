"use strict";
/**
 * Tasks Manager
 *
 * @author iwillwen <willwengunn@gmail.com>
 */
const originFS = require("fs");
const globAsync = require("glob");
const Promise = require("bluebird");
const chalk = require("chalk");
const lodash_1 = require("lodash");
const crypto_1 = require("crypto");
const fs = Promise.promisifyAll(originFS);
const glob = Promise.promisify(globAsync);
class TasksM {
    constructor() {
        this.hashFile = 'tasksm.json';
        this.tasks = new Map();
        this.hashs = new Map();
        this._cwd = process.cwd();
    }
    cwd(cwd) {
        this._cwd = cwd;
    }
    /**
     * Define a building task
     *
     * @param  {string} taskName
     * @param  {Object|string[]|string} patterns
     * @param  {TaskHandler} taskHandler
     */
    defineTask(taskName, patterns, taskHandler) {
        this.tasks.set(taskName, {
            patterns, taskHandler
        });
    }
    define(tasksOrTaskName, options) {
        // Define a single task
        if (typeof tasksOrTaskName === 'string') {
            const taskName = tasksOrTaskName;
            const { patterns, task: taskHandler } = options;
            this.defineTask(taskName, patterns, taskHandler);
        }
        else {
            // Define multiple tasks
            const tasks = tasksOrTaskName;
            for (const name of Object.keys(tasks)) {
                const { patterns, task: taskHandler } = tasks[name];
                this.defineTask(name, patterns, taskHandler);
            }
        }
    }
    /**
     * Load or init the hash file
     *
     * @returns Promise
     */
    loadOrInitHashFile() {
        const filename = this.hashFile;
        return new Promise((resolve, reject) => {
            fs.access(filename, originFS.constants.R_OK, err => {
                const exists = !err;
                (new Promise((resolve, reject) => {
                    if (exists) {
                        return fs.readFileAsync(filename)
                            .then(data => resolve(data.toString()));
                    }
                    else {
                        const data = JSON.stringify({}, null, 2);
                        return fs.writeFileAsync(filename, data)
                            .then(() => resolve(data));
                    }
                }))
                    .then((textData) => JSON.parse(textData))
                    .then(hashData => {
                    for (const key of Object.keys(hashData)) {
                        this.hashs.set(key, hashData[key]);
                    }
                    resolve(hashData);
                })
                    .catch(reject);
            });
        });
    }
    writeHashFile(hashData = this.hashs) {
        return fs.writeFileAsync(this.hashFile, plainMaptoJSON(hashData, null, 2))
            .then(() => hashData);
    }
    flattenTasks(tasks) {
        const _tasks = new Map();
        tasks.forEach((options, taskName) => {
            const { patterns, taskHandler } = options;
            if (isPattern(patterns)) {
                _tasks.set(taskName + ':default', options);
            }
            else {
                const subTasksNames = Object.keys(patterns);
                subTasksNames.forEach(subTaskName => _tasks.set(`${taskName}:${subTaskName}`, {
                    patterns: patterns[subTaskName],
                    taskHandler
                }));
            }
        });
        return _tasks;
    }
    runTask(taskName, subTaskName, patterns, taskHandler, hash) {
        let pattern = patterns.toString();
        if (lodash_1.isArray(patterns)) {
            pattern = `{${patterns.join(',')}}`;
        }
        return glob(pattern)
            .then((filenames) => {
            return Promise.reduce(filenames, (total, filename) => {
                return fs.statAsync(filename)
                    .then(stat => `${filename}:${stat.ctime.getTime()}`)
                    .then(line => {
                    total.push(line);
                    return total;
                });
            }, []);
        })
            .then((n) => n.join())
            .then(str => md5(str))
            .then(newHash => {
            // No change
            if (hash === newHash)
                return false;
            this.hashs.set(`${taskName}:${subTaskName}`, newHash);
            const rtn = taskHandler(subTaskName, pattern);
            if (isPromise(rtn)) {
                return rtn;
            }
            else {
                return Promise.resolve(newHash);
            }
        });
    }
    run(taskName) {
        this.loadOrInitHashFile()
            .then(hashData => {
            const tasks = this.flattenTasks(this.tasks);
            return Promise.reduce(Array.from(tasks.keys()), (total, taskName) => {
                const { patterns, taskHandler } = tasks.get(taskName);
                return new Promise((resolve, reject) => {
                    const [supTaskName, subTaskName] = taskName.split(':');
                    process.stdout.write(chalk.green('[INFO]') + chalk.white(` Running Task ${supTaskName}:${subTaskName}...`));
                    this.runTask(supTaskName, subTaskName, patterns, taskHandler, this.hashs.get(taskName))
                        .then(rtn => {
                        if (rtn === false) {
                            console.log(chalk.white('skip'));
                        }
                        else {
                            console.log(chalk.white('done'));
                        }
                        resolve();
                    })
                        .catch(err => {
                        console.log(chalk.red('failed'));
                        reject();
                    });
                });
            }, []);
        })
            .then(() => {
            process.stdout.write(chalk.green('[INFO]') + chalk.white(` Writing Hash file...`));
            return this.writeHashFile();
        })
            .then(() => {
            console.log(chalk.white('done'));
            console.log(chalk.green('[INFO] Finish'));
        });
    }
    useFile(filename) {
        this.hashFile = filename;
    }
}
function isPlainType(v) {
    const plainTypes = ['string', 'number'];
    return plainTypes.indexOf(typeof v) >= 0;
}
function plainMaptoJSON(map, ...args) {
    const o = {};
    for (const key of Array.from(map.keys())) {
        if (!isPlainType(key))
            continue;
        o[key] = map.get(key);
    }
    return JSON.stringify.call(JSON, o, ...args);
}
function md5(str) {
    const md5 = crypto_1.createHash('md5');
    md5.update(str);
    return md5.digest('hex');
}
function isPromise(o) {
    return lodash_1.isFunction(o.then) && lodash_1.isFunction(o.catch);
}
function isPattern(o) {
    return lodash_1.isArray(o) || lodash_1.isString(o);
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = new TasksM();
//# sourceMappingURL=tasksm.js.map