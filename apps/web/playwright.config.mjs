import {defineConfig,devices} from '@playwright/test';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

const base='http://127.0.0.1:5173';
const database=join(process.env.RUNNER_TEMP||tmpdir(),'vutadex-browser-e2e-'+process.pid+'.db');
export default defineConfig({
  testDir:'./e2e',fullyParallel:false,workers:1,retries:0,
  timeout:40000,expect:{timeout:10000},
  reporter:[['list'],['html',{open:'never'}]],
  use:{baseURL:base,trace:'retain-on-failure',screenshot:'only-on-failure'},
  projects:[
    {name:'chromium',use:{...devices['Desktop Chrome'],channel:'chrome'}},
    {name:'firefox',use:{...devices['Desktop Firefox']}},
    {name:'webkit',use:{...devices['Desktop Safari']}}
  ],
  webServer:[
    {command:'npm run server --workspace @vutadex/web',url:'http://127.0.0.1:3001/api/v1/health',
      env:{NODE_ENV:'test',APP_ORIGIN:base,PORT:'3001',VUTADEX_DB:database,LOG_LEVEL:'silent'},
      timeout:60000,reuseExistingServer:false},
    {command:'npm run dev:ui --workspace @vutadex/web',url:base,timeout:60000,reuseExistingServer:false}
  ]
});
