import cluster from 'cluster';
import { createServer, Server } from 'http';
import { availableParallelism } from 'os';
import { handle } from './server.js';
import { NEW_PACKAGE_ADDED, newPackageAdded, NewPackageAddedMessage } from './apk.js';

export const PORT = 80;
const FAILURE_TO_START_MS = 1000;
const MAX_RETRIES = 5;

let restarts = 0;
let lastDeath = new Date();
let happyRestartTimeout: NodeJS.Timeout | undefined;
let shuttingDown = false;

const parallelism = availableParallelism();

// if (cluster.isPrimary) {
//    run init tasks here
// }

let server: Server | undefined;

if (parallelism === 1 || !cluster.isPrimary) {
  server = createServer(handle);
  server.listen(PORT);
} else {
  console.log("primary:\t Parallelism", parallelism);
  console.log(`primary:\t Primary ${process.pid} is running`);

  for (let i = 0; i < parallelism; i++) {
    const worker = cluster.fork();

    worker.on('message', (msg) => {
      // handle workers signaling they added a new package
      if (msg.type === NEW_PACKAGE_ADDED) {
        newPackageAdded((msg as NewPackageAddedMessage).data.path);
      }
    })
  }

  cluster.on('exit', (worker, code, signal) => {
    if (shuttingDown) return;

    console.log(`primary:\t Worker ${worker.process.pid} died`);

    const death = new Date();
    const timeSinceLastDeathMs = death.getTime() - lastDeath.getTime();
    lastDeath = death;
    if (timeSinceLastDeathMs <= FAILURE_TO_START_MS) {
      clearTimeout(happyRestartTimeout);
      happyRestartTimeout = undefined;

      if (restarts <= MAX_RETRIES) {
        console.log("primary:\t Restarting...");
        restarts += 1;
        cluster.fork();
        if (happyRestartTimeout === undefined) {
          happyRestartTimeout = setTimeout(() => { restarts = 0 }, FAILURE_TO_START_MS + 10);
        }
      } else {
        console.log("primary:\t Too many retries, I give up");
        stop(1);
      }
    }
  });
}

if (cluster.isWorker) {
  console.log(`worker: \t worker ${process.pid} started`);
} else {
  console.log(`primary:\t Listening on localhost:${PORT}`);
}


export async function stop(exitCode: number = 0) {
  console.log((cluster.isWorker ? "worker: " : "primary:") + "\t Stopping...");
  shuttingDown = true;

  server?.close();
  process.exit(exitCode);
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
