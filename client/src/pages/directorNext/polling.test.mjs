import test from 'node:test';
import assert from 'node:assert/strict';
import {directorPollInterval} from './polling.ts';
import {shouldToastApiError} from '../../lib/apiErrors.ts';
test('permanent configuration errors stop polling; transient failures back off with a cap',()=>{
 assert.equal(directorPollInterval({status:503,code:'production_model_capability_missing'},1),false);
 assert.equal(directorPollInterval({status:503,code:'director_projection_unavailable'},1),false);
 assert.equal(directorPollInterval({status:404},1),false);
 assert.equal(directorPollInterval(null,0),4000);
 assert.equal(directorPollInterval({status:500},1),8000);
 assert.equal(directorPollInterval({status:500},6),30000);
 assert.equal(directorPollInterval({},2),16000);
});
test('polling owns inline errors, while command errors retain toast presentation',()=>{
 assert.equal(shouldToastApiError({errorPresentation:'inline'},500),false);
 assert.equal(shouldToastApiError({errorPresentation:'inline'},undefined),false);
 assert.equal(shouldToastApiError({},500),true);
 assert.equal(shouldToastApiError({silentErrorStatuses:[404]},404),false);
});
