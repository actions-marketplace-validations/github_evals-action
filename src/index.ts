import * as core from '@actions/core';
import { runAction } from './action.js';

runAction().catch(() => core.setFailed('Required structured reporting failed. No evaluation pass is claimed.'));
