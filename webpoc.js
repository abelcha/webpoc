#!/usr/bin/env babel-node

/* eslint-disable no-console */
import events from 'events';
import minimist from 'minimist';
import fs from 'fs';
import cluster from 'cluster';
import watch from 'node-watch';
import Bluebird from 'bluebird';
import { ModuleHmr, QueueHmr, ExpressHmr } from './hmr';

events.EventEmitter.prototype._maxListeners = 0;

const argv = minimist(process.argv.slice(2));

const spawnProcess = () => {
  cluster.fork()
  .on('exit', (code) => {
    if (code === 1) {
      // ERROR
      console.log('[Error Exited] - Waiting for changes to restart');
      const watcher = watch(process.cwd(), {
        recursive: true,
        filter: name => !/node_modules/.test(name),
      }, () => {
        watcher.close();
        return spawnProcess();
      })
      .setMaxListeners(Infinity);
    } else {
      console.log('[Restarting] ...');
      return spawnProcess();
    }
    return 0;
  });
};

const getHmrInstance = (script, _config) => {
  if (script.type === 'module') {
    return new ModuleHmr(script, _config);
  }
  if (script.type === 'express-server') {
    return new ExpressHmr(script, _config);
  }
  if (script.type === 'queue') {
    return new QueueHmr(script, _config);
  }
  return null;
};

const launchProcesses = (_config) => {
  Bluebird.map(_config.scripts, (script) => {
    const instance = getHmrInstance(script, _config);
    if (!instance) {
      return Promise.resolve(`No '${script.type}' process.type`);
    }
    return instance.launch();
  }, { concurrency: 1 })
  .then(() => console.log('[OK] - Listening for changes ...'))
  .catch((err) => {
    console.log(err);
    process.exit(1);
  });
};

const getProcessConfig = (processName) => {
  const path = argv.config || `${process.cwd()}/webpoc.json`;
  let config;

  try {
    config = JSON.parse(fs.readFileSync(path, 'utf-8'));
  } catch (err) {
    console.error(`ERROR: cannot parse config file '${path}'`);
    process.exit();
  }
  if (!config[processName]) {
    console.error(`Missing process config '${processName}'`);
    process.exit();
  }
  return config[processName];
};


if (cluster.isMaster) {
  spawnProcess();
} else {
  const processName = argv._[0];

  if (!processName) {
    console.error('USAGE: webpoc [process-name] --config [config-file]');
    process.exit();
  }
  const processConfig = getProcessConfig(processName);
  console.log(`[Starting] - ${processName} ...`);
  launchProcesses(processConfig);
}
