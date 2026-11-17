import {buildWorker} from './build-native-worker.mjs';
await buildWorker({entry:'workers/durable-runtime.mts',outfile:'dist/durable-runtime.mjs'});
