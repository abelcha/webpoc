/* eslint-disable import/no-dynamic-require */
/* eslint-disable global-require */
/* eslint-disable no-console */

const watchGlob = require('watch-glob');
const { throttle } = require('lodash');

export default class HmrBase {
  constructor(script, config) {
    this.script = script;
    this.server = null;
    this.module = null;
    this.startThrottled = throttle(() => {
      console.time(`[HMR] - ${script.name}`);
      this.start(() => {
        console.timeEnd(`[HMR] - ${script.name}`);
      });
    }, config.throttling);
  }

  require(relativePath) {
    const { root } = this.script;
    return require(`${root || process.cwd()}/${relativePath}`).default;
  }

  clearModuleCache() {
    const { keepCache } = this.script;
    Object.keys(require.cache).forEach((key) => {
      const keepCached = keepCache && keepCache.find(cache => key.includes(cache));
      if (!key.includes('node_modules') && !keepCached) {
        delete require.cache[key];
      }
    });
  }

  launch() {
    const { name, watch, spawn } = this.script;
    console.time(`[Launching] - ${name}`);
    return new Promise((resolve) => {
      watchGlob(watch, { callbackArg: 'relative' }, (path) => {
        console.log(`[File Changed] - ${path}`);
        if (spawn) {
          process.exit();
        }
        this.clearModuleCache();
        this.startThrottled();
      });

      this.start(() => {
        console.timeEnd(`[Launching] - ${name}`);
        resolve();
      });
    });
  }
}


export class ModuleHmr extends HmrBase {

  start(done) {
    const { path } = this.script;
    this.module = this.require(path);
    done();
  }

}


export class QueueHmr extends HmrBase {

  start(done) {
    const { options: { queuePath }, path } = this.script;
    const queue = this.require(queuePath);
    if (!queue.workers.length) {
      this.module = this.require(path);
      this.module();
      return done();
    }
    return queue.shutdown(0, () => {
      this.clearModuleCache();
      this.module = this.require(path);
      this.module();
      return done();
    });
  }

}

export class ExpressHmr extends HmrBase {

  start(done) {
    const { path } = this.script;
    this.module = this.require(path);
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    this.server = this.module.listen(process.env.PORT)
      .on('listening', done);
  }

}
