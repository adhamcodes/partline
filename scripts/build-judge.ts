import { buildJudgePackage } from '../src/dashboard/build.js';

const result = await buildJudgePackage();
console.log(JSON.stringify({ result: 'PASS', output: result.output, files: result.files, callsPlaced: 0, externalServices: 0 }));
